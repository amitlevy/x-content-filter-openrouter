// ==UserScript==
// @name         X Content Filter
// @version      1.17
// @updateURL    https://omba.nl/files/x-ai-filter/x-ai-filter-userscript.js
// @downloadURL  https://omba.nl/files/x-ai-filter/x-ai-filter-userscript.js
// @description  Analyzes and filters content on X.com based on configured topics
// @match        https://x.com/*
// @grant        GM.xmlHttpRequest
// @grant        GM.setValue
// @grant        GM.getValue
// ==/UserScript==

(function() {
    'use strict';

    const topicsConfig = [
        {"topic": "politics", "description": "posts about political subjects", "threshold": 0.8},
        {"topic": "negativity", "description": "posts with overly negative sentiment", "threshold": 0.9}
    ];

    let hiddenPostsCount = 0;
    let hiddenPostsLog = [];

    function createOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'hiddenPostsOverlay';
        overlay.style.cssText = 'position:fixed;top:0;right:0;z-index:9999;';
        document.body.appendChild(overlay);

        const bubble = document.createElement('div');
        bubble.style.cssText = 'font-family:sans-serif;background:#1DA1F2;color:#fff;border-radius:3px;padding:5px 8px;cursor:pointer;margin:5px;';
        bubble.onclick = toggleLog;
        overlay.appendChild(bubble);

        const log = document.createElement('div');
        log.style.cssText = 'font-family:sans-serif;display:none;background:#fff;border:1px solid #000;padding:10px;max-height:300px;overflow-y:auto;color:black;';
        overlay.appendChild(log);

        return { bubble, log };
    }

    const { bubble, log } = createOverlay();

    function toggleLog() {
        log.style.display = log.style.display === 'none' ? 'block' : 'none';
    }

    function updateOverlay(message) {
        hiddenPostsCount++;
        hiddenPostsLog.push(message);
        bubble.textContent = `${hiddenPostsCount} posts hidden`;
        log.innerHTML = hiddenPostsLog.map(msg => `<p>${msg}</p>`).join('');
    }

    async function checkForNewPosts() {
        const apiKey = await getOpenRouterApiKey();
        if (!apiKey) {
            console.error("No API key provided. Aborting analysis.");
            return;
        }

        const posts = document.querySelectorAll('[data-testid="cellInnerDiv"]');

        posts.forEach(async post => {
            const tweetArticle = post.querySelector('article[data-testid="tweet"]');
            if (!tweetArticle) return;

            const postId = Array.from(tweetArticle.querySelectorAll('a'))
                .find(a => a.href.includes('/status/'))
                ?.href.split('/')
                .find((part, index, array) => array[index - 1] === 'status');
            const postTextElement = tweetArticle.querySelector('[data-testid="tweetText"]');
            const postText = postTextElement ? postTextElement.innerText.trim() : '';

            if (postId) {
                let analysis = await getCachedAnalysis(postId);
                if (!analysis) {
                    analysis = await analyzeTweet(postText, apiKey);
                    await cacheAnalysis(postId, analysis);
                }
                applyPostVisibility(postId, analysis);
            }
        });
    }

    async function getCachedAnalysis(postId) {
        const key = `analysis_${postId}`;
        const cached = await GM.getValue(key, null);
        return cached;
    }

    async function cacheAnalysis(postId, analysis) {
        const key = `analysis_${postId}`;
        await GM.setValue(key, analysis);
    }

    function findPostElement(postId) {
        if (typeof postId !== 'string') {
            throw new Error('postId must be a string');
        }
        const cellInnerDivs = document.querySelectorAll('[data-testid="cellInnerDiv"]');
        
        for (const div of cellInnerDivs) {
            const link = div.querySelector(`a[href*="/status/${postId}"]`);
            if (link) {
                return div;
            }
        }
        
        return null;
    }

    function applyPostVisibility(postId, analysis) {
        if (typeof analysis === 'object' && analysis !== null) {
            const shouldHide = topicsConfig.some(topic => 
                topic.topic in analysis && analysis[topic.topic] > topic.threshold
            );

            const postElement = findPostElement(postId);
            if (shouldHide) {
                if (postElement.style.display !== 'none') {
                    postElement.style.display = 'none';
                    const tweetUrl = `https://x.com/user/status/${postId}`;
                    const tweetText = postElement.querySelector('[data-testid="tweetText"]')?.innerText.trim() || 'Text not found';
                    const scores = topicsConfig.map(topic => `${topic.topic}: ${analysis[topic.topic].toFixed(2)}`).join(', ');
                    const message = `Post ${postId} hidden: ${tweetUrl}\n${tweetText}\nScores: ${scores}`;
                    updateOverlay(message);
                }
            }
        }
    }

    async function analyzeTweet(tweetText, apiKey) {
        let retries = 0;
        const maxRetries = 3;
        const messages = [
            {
                role: "system",
                content: `Your task is to evaluate Tweets/X posts. Always respond in JSON. Follow this format:\n\n{\n${topicsConfig.map(topic => `    "${topic.topic}": 0.0`).join(',\n')}\n}\n\nRate the provided post from 0.0 to 1.0 for each topic. Here are the descriptions for each topic:\n\n${topicsConfig.map(topic => `${topic.topic}: ${topic.description}`).join('\n')}`
            },
            {
                role: "user",
                content: tweetText
            }
        ];

        while (retries < maxRetries) {
            try {
                const response = await new Promise((resolve, reject) => {
                    GM.xmlHttpRequest({
                        method: "POST",
                        url: "https://openrouter.ai/api/v1/chat/completions",
                        headers: {
                            "Content-Type": "application/json",
                            "Authorization": `Bearer ${apiKey}`,
                            "HTTP-Referer": window.location.origin, // Required by OpenRouter
                            "X-Title": "X Content Filter" // Recommended by OpenRouter
                        },
                        data: JSON.stringify({
                            messages: messages,
                            model: "meta-llama/llama-3-8b-instruct", // OpenRouter model ID for Llama 3
                            temperature: 1,
                            max_tokens: 1024,
                            top_p: 1,
                            stream: false,
                            response_format: {
                                type: "json_object"
                            }
                        }),
                        onload: resolve,
                        onerror: reject
                    });
                });

                if (response.status === 400) {
                    retries++;
                    continue;
                }

                const data = JSON.parse(response.responseText);
                return JSON.parse(data.choices[0].message.content);
            } catch (error) {
                retries++;
                if (retries === maxRetries) {
                    console.error("Max retries reached. Returning empty object.");
                    return {};
                }
            }
        }

        return {};
    }

    async function getOpenRouterApiKey() {
        let apiKey = await GM.getValue('OPENROUTER_API_KEY', null);
        if (!apiKey) {
            apiKey = prompt("Please enter your OpenRouter API key:");
            if (apiKey) {
                await GM.setValue('OPENROUTER_API_KEY', apiKey);
            }
        }
        return apiKey;
    }

    function debounce(func, delay) {
        let timeoutId;
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    }

    const debouncedCheck = debounce(checkForNewPosts, 300);

    window.addEventListener('scroll', () => {
        if (window.location.hostname === 'x.com') {
            debouncedCheck();
        }
    });

    if (window.location.hostname === 'x.com') {
        checkForNewPosts();
    }
})();
