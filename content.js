// Configuration object for topics
const topicsConfig = [
    {"topic": "politics", "description": "posts about political subjects", "threshold": 0.8},
    {"topic": "negativity", "description": "posts with overly negative sentiment", "threshold": 0.9}
];

// Add CSS for blurred posts
function addBlurCSS() {
    const style = document.createElement('style');
    style.textContent = `
        .x-content-filter-blurred {
            filter: blur(5px);
            transition: filter 0.3s ease;
        }
        .x-content-filter-blurred:hover {
            filter: blur(3px);
        }
        .x-content-filter-analyzing {
            position: relative;
        }
        .x-content-filter-analyzing::after {
            content: "Analyzing...";
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            color: white;
            padding: 4px;
            font-size: 12px;
            text-align: center;
            border-radius: 4px;
            pointer-events: none;
        }
    `;
    document.head.appendChild(style);
}

// Add the CSS when the script loads
addBlurCSS();

// Function to check for new posts on the page
async function checkForNewPosts() {
    // Early check for API key
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

        // Get the main tweet text (first tweetText element)
        const allTweetTextElements = tweetArticle.querySelectorAll('[data-testid="tweetText"]');
        const postText = allTweetTextElements.length > 0 ? allTweetTextElements[0].innerText.trim() : '';

        // Extract quoted tweet text if present
        const quoteTweetElement = tweetArticle.querySelector('[data-testid="quoteTweet"]');
        let quotedTweetText = '';
        if (quoteTweetElement) {
            const quotedTextElement = quoteTweetElement.querySelector('[data-testid="tweetText"]');
            quotedTweetText = quotedTextElement ? quotedTextElement.innerText.trim() : '';
        }

        if (postId && !post.hasAttribute('data-x-content-filter-processed')) {
            // Mark as being processed to avoid duplicate processing
            post.setAttribute('data-x-content-filter-processed', 'true');

            // Apply blur immediately while analyzing
            post.classList.add('x-content-filter-blurred', 'x-content-filter-analyzing');

            // Check for cached analysis first
            let analysis = await getCachedAnalysis(postId);
            if (!analysis) {
                // No cached result, need to analyze
                analysis = await analyzeTweet(postText, apiKey);
                await cacheAnalysis(postId, analysis);
            }

            // Analyze quoted tweet if present
            let quotedAnalysis = null;
            if (quotedTweetText) {
                const quotedCacheKey = `${postId}_quoted`;
                quotedAnalysis = await getCachedAnalysis(quotedCacheKey);
                if (!quotedAnalysis) {
                    quotedAnalysis = await analyzeTweet(quotedTweetText, apiKey);
                    await cacheAnalysis(quotedCacheKey, quotedAnalysis);
                }
            }

            // Remove the analyzing indicator
            post.classList.remove('x-content-filter-analyzing');

            // Apply visibility based on analysis (including quoted tweet)
            applyPostVisibility(postId, analysis, post, quotedAnalysis);
        }
    });
}

// Function to get cached analysis
async function getCachedAnalysis(postId) {
    return new Promise((resolve) => {
        chrome.storage.local.get([`analysis_${postId}`], result => {
            resolve(result[`analysis_${postId}`] || null);
        });
    });
}

// Function to cache analysis
async function cacheAnalysis(postId, analysis) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [`analysis_${postId}`]: analysis }, resolve);
    });
}

// Function to apply post visibility based on analysis
function applyPostVisibility(postId, analysis, postElement, quotedAnalysis = null) {
    if (typeof analysis === 'object' && analysis !== null) {
        // Check if main tweet should be hidden
        const mainShouldHide = topicsConfig.some(topic =>
            topic.topic in analysis && analysis[topic.topic] > topic.threshold
        );

        // Check if quoted tweet should be hidden
        let quotedShouldHide = false;
        if (quotedAnalysis && typeof quotedAnalysis === 'object') {
            quotedShouldHide = topicsConfig.some(topic =>
                topic.topic in quotedAnalysis && quotedAnalysis[topic.topic] > topic.threshold
            );
        }

        const shouldHide = mainShouldHide || quotedShouldHide;

        if (!postElement) {
            postElement = findPostElement(postId);
        }

        if (postElement) {
            // Remove blur if content is acceptable
            if (!shouldHide) {
                postElement.classList.remove('x-content-filter-blurred');
                const tweetPreview = postElement.querySelector('[data-testid="tweetText"]')?.innerText.trim().slice(0, 50) || '';
                console.log(`Post ${postId} passed filter checks: "${tweetPreview}${tweetPreview.length >= 50 ? '...' : ''}"`);
            } else {
                // Keep it hidden for filtered content
                postElement.style.display = 'none';
                const tweetUrl = `https://x.com/user/status/${postId}`;
                const tweetText = postElement.querySelector('[data-testid="tweetText"]')?.innerText.trim() || 'Text not found';

                if (mainShouldHide) {
                    console.log(`Post ${postId} hidden due to main tweet scores:`);
                    topicsConfig.forEach(topic => {
                        if (topic.topic in analysis) {
                            console.log(`  ${topic.topic}: ${analysis[topic.topic]}`);
                        }
                    });
                }
                if (quotedShouldHide) {
                    console.log(`Post ${postId} hidden due to quoted tweet scores:`);
                    topicsConfig.forEach(topic => {
                        if (topic.topic in quotedAnalysis) {
                            console.log(`  ${topic.topic}: ${quotedAnalysis[topic.topic]}`);
                        }
                    });
                }
                console.log(`Tweet URL: ${tweetUrl}`);
                console.log(`Tweet Text: ${tweetText}`);
            }
        } else {
            console.log(`Could not find element for post ${postId} to hide`);
        }
    } else {
        console.log(`Skipping post ${postId} due to invalid analysis result`);
        // Remove blur if we can't analyze it
        if (postElement) {
            postElement.classList.remove('x-content-filter-blurred', 'x-content-filter-analyzing');
        }
    }
}

// Function to find the div element containing a specific post ID
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
    
    return null; // Return null if no matching element is found
}
window.findPostElement = findPostElement;

// Function to reset the cache (seenPostIds and analysis results)
function resetCache() {
    chrome.storage.local.get(null, (items) => {
        const allKeys = Object.keys(items);
        const analysisKeys = allKeys.filter(key => key.startsWith('analysis_'));
        chrome.storage.local.remove(analysisKeys, () => {
            console.log('Cache (analysis results) has been reset.');
        });
    });
}

// Make resetCache function available in the global scope
window.resetCache = resetCache;

console.log('To reset the cache, run resetCache() in the console.');

// Function to analyze a tweet using the OpenRouter API
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
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${apiKey}`,
                    "HTTP-Referer": window.location.origin, // Required by OpenRouter
                    "X-Title": "X Content Filter" // Recommended by OpenRouter
                },
                body: JSON.stringify({
                    messages: messages,
                    model: "meta-llama/llama-3-8b-instruct", // OpenRouter model ID for Llama 3
                    temperature: 1,
                    max_tokens: 1024,
                    top_p: 1,
                    stream: false,
                    response_format: {
                        type: "json_object"
                    }
                })
            });

            if (response.status === 400) {
                retries++;
                continue;
            }

            const data = await response.json();
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

// Function to get or set the OpenRouter API key
async function getOpenRouterApiKey() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['OPENROUTER_API_KEY'], result => {
            if (result.OPENROUTER_API_KEY) {
                resolve(result.OPENROUTER_API_KEY);
            } else {
                const apiKey = prompt("Please enter your OpenRouter API key:");
                if (apiKey) {
                    chrome.storage.local.set({ OPENROUTER_API_KEY: apiKey }, () => {
                        resolve(apiKey);
                    });
                } else {
                    resolve(null);
                }
            }
        });
    });
}

// Debounce function to limit how often the scroll event fires
function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
}

// Create debounced version of checkForNewPosts
const debouncedCheck = debounce(checkForNewPosts, 300);

// Modify the scroll event listener to call checkForNewPosts
window.addEventListener('scroll', () => {
    if (window.location.hostname === 'x.com') {
        debouncedCheck();
    }
});

// Function to handle new content being added to the DOM
function observeForNewContent() {
    const observer = new MutationObserver((mutations) => {
        let hasNewPosts = false;
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length > 0) {
                hasNewPosts = true;
            }
        });
        if (hasNewPosts) {
            debouncedCheck();
        }
    });
    
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

// Initial check when the page loads
if (window.location.hostname === 'x.com') {
    checkForNewPosts();
    observeForNewContent();
}