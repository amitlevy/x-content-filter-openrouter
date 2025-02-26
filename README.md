# X Content Filter (OpenRouter Edition)

> This is a fork of the original X Content Filter project, modified to use OpenRouter API instead of Groq API.

## Overview

The X Content Filter is a browser extension that analyzes and filters content on X.com based on configured topics. Unlike the original version which used Groq, this fork uses the OpenRouter API to perform the analysis, giving you access to powerful LLM models through a more flexible API.

## Features

- **Content Analysis**: Uses AI to analyze tweets for configured topics (politics, negativity, etc.)
- **Smart Filtering**: Automatically hides content that exceeds your chosen thresholds
- **Content Blurring**: Blurs all new tweets until analysis is complete, preventing unwanted exposure
- **Visual Indicators**: Shows when content is being analyzed with "Analyzing..." labels
- **Caching**: Remembers previously analyzed tweets to reduce API calls
- **Mobile Support**: Works on mobile browsers via userscript

## Why OpenRouter instead of Groq?

OpenRouter offers several advantages:
- Access to multiple AI models from different providers through a single API
- More flexibility in model selection
- No vendor lock-in
- If you want you can use Grok, which I find amusing

## Installation

1. Clone the repository or download the source code.
2. Open your browser's extension management page (e.g., `chrome://extensions/` for Chrome).
3. Enable "Developer mode".
4. Click "Load unpacked" and select the source code directory.
5. Get an OpenRouter API key from [OpenRouter](https://openrouter.ai/) (you'll need to create an account).

## Usage

- The extension automatically blurs and analyzes posts on X.com as they appear in your feed.
- Posts that exceed the configured thresholds will remain hidden; safe posts will be unblurred.
- When you first use the extension, it will prompt you to enter your OpenRouter API key.
- To reset the cache, run `resetCache()` in the browser console.

## How It Works

1. **Initial Blurring**: All new tweets are immediately blurred when they load to prevent unwanted exposure.
2. **Analysis**: The extension uses OpenRouter API to analyze the tweet content based on configured topics.
3. **Decision**: 
   - If content passes filters: The blur is removed and content becomes visible.
   - If content fails filters: The tweet is hidden completely.
4. **Visual Feedback**: Blurred tweets show an "Analyzing..." indicator while being processed.

## Configuration

Topics and thresholds can be modified in `content.js`.

```javascript
const topicsConfig = [
    {"topic": "politics", "description": "posts about political subjects", "threshold": 0.8},
    {"topic": "negativity", "description": "posts with overly negative sentiment", "threshold": 0.9}
];
```

The extension is configured to use the "meta-llama/llama-3-8b-instruct" model from OpenRouter, but you can modify this in the code if desired. OpenRouter supports many other models as well.

## Files

- `manifest.json`: Extension manifest file.
- `content.js`: Main script for analyzing and filtering posts.
- `x-ai-filter-userscript.js`: Userscript version for mobile devices.

## Mobile Support

Use the [x-ai-filter-userscript.js](x-ai-filter-userscript.js) file to run the extension on mobile.

See the iOS Userscripts repo for more information:
https://github.com/quoid/userscripts

## License

This project is licensed under the Apache License 2.0 - see the LICENSE file for details. 

This is a fork of the original X Content Filter project. All modifications are provided under the same Apache 2.0 license.
