# congress-to-insta
Code files used in my full pipeline in Google AppsScript that is bound to a Google Sheet. 
Automated Instagram account that posts summaries of newly passed US laws with congressional voting records.

## Purpose
Educational tool for young American activists to stay informed about new legislation.

## Data Source
All legislative data is pulled from [congress.gov](https://congress.gov)

## Technology Stack
- **Google Apps Script** - Automation engine
- **Google Sheets** - Data storage and processing
- **Google Slides** - Visual template generation
- **ImgBB API** - Image hosting
- **Instagram Graph API** - Publishing to Instagram

## Files
- `Code.gs` - Main pipeline orchestration
- `InstagramPublisher.gs` - Instagram API integration
- `ImageGenerator.gs` - Slide generation and image export
- `Utilities.gs` - Helper functions

## Setup
1. Copy Google Sheet template (link)
2. Add Apps Script files to sheet (Extensions → Apps Script)
3. Configure API keys in CONFIG object
4. Set up time-based trigger

## Features
- ✅ Automated daily posting
- ✅ Generates visual summaries from Google Slides
- ✅ Two-step Instagram publishing (container creation + publishing)
- ✅ Rate limit protection
- ✅ Error handling and logging
- ✅ Tracks posting status in spreadsheet

## API Keys Required
- ImgBB API key (free)
- Instagram Graph API access token
- Instagram Business Account ID

## Credits
Created by Elena Cura for Capstone - Self Directed Study.
Data from congress.gov
