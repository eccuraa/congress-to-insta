# congress-to-insta
Automated Instagram account ([@yea.or.nay_USA](https://www.instagram.com/yea.or.nay_usa/)) that posts summaries of newly passed US laws with visualized congressional voting records. See this [presentation](https://docs.google.com/presentation/d/1O2CJdJtFnps8404q8m5fU1SZ_2z0dRrmrRtZzfFFGxE/edit?usp=sharing) for an overview on my process.
Code files used in my full pipeline in Google AppsScript that is bound to [this Google Sheet](https://docs.google.com/spreadsheets/d/1jR7iJsgD7mwk7vSgY7B_MoUBu9G6OgYscF13t-SD_4g/edit?usp=sharing). 


## Purpose
Journalistic tool for young Americans to stay informed about newly passed laws. Full motivation can be found in [my draft write-up](https://docs.google.com/document/d/1Y43Ke7RZ8xVA0rX_uyYEeHsEKPS6bSW7CdWJpClqZNU/edit?usp=sharing).

## Data Source
All legislative data is pulled from [congress.gov](https://congress.gov) using the [Congress.gov API](https://github.com/LibraryOfCongress/api.congress.gov/blob/main/Documentation/BillEndpoint.md)

## Technology Stack
- **Google Apps Script** - Automation engine with built-in daily trigger
- **Google Sheets** - Data storage and processing
- **Google Slides** - Visual template
- **ImgBB API** - Image hosting
- **Instagram Graph API** - Publishing to Instagram
- **Congress.gov API** - Scraping from Law, Bill and House Roll Call Vote endpoints
- **Anthropic API** - Summarizing with Claude
- **Google Cloud** - Serverless computing to run linked Python scripts autonomously, from a Javascript project
  - **Cloud Functions Run API**
  - **Cloud Build API**
  - **Google Cloud CLI**
- **VSCode** - To create & edit local Python project for Google Cloud CLI

## Files
- `scrapingScript.gs` - Scrapes data from Congress.gov
- `claudeSummarization.gs` - Anthropic API integration
- `imageUrlCreation.gs` - Slide template customization and image export
- `toInstagram.gs` - Instagram API integration

## Setup (CLASP integration for local development coming soon)
1. Copy Google Sheet template [link](https://docs.google.com/spreadsheets/d/1jR7iJsgD7mwk7vSgY7B_MoUBu9G6OgYscF13t-SD_4g/edit?usp=sharing)
2. Add Apps Script files to sheet (Extensions → Apps Script)
3. Configure API keys
4. Set up time-based daily triggers

## Features
- ✅ Automated daily scraping & posting
- ✅ Prompt engineered summarization with Claude
- ✅ Transfers summary to Google Slides
- ✅ Creates public Image URL by uploading Slide 
- ✅ Two-step Instagram publishing (container creation + publishing)
- ✅ Rate limit protection
- ✅ Error handling and logging
- ✅ Tracks posting status in spreadsheet

## API Keys Required
- ImgBB API key (free)
- Instagram Graph API key (recommended [setup tutorial](https://www.youtube.com/watch?v=gkpmMEqcn4Q))
- Anthropic API key (purchase access tokens, <$5)
- Congress.gov API key

## Credits
Created by Elena Cura
