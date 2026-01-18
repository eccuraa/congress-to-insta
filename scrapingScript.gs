// Congress.gov API - Fetch Public Laws
const API_KEY = 'API_KEY_HERE';
const BASE_URL = 'https://api.congress.gov/v3';

// ===== DATE CONFIGURATION =====
// Set USE_CUSTOM_DATE to true to use CUSTOM_DATE, or false to use automatic (3 days ago)
const USE_CUSTOM_DATE = false;           // Change to false for automatic mode
const CUSTOM_DATE = '2025-12-19';        // Only used if USE_CUSTOM_DATE is true
// ==============================

/**
 * Main function - fetches laws based on configuration above
 */
function fetchPublicLawsToday() {
  const dateToUse = USE_CUSTOM_DATE ? CUSTOM_DATE : null;
  fetchPublicLaws(dateToUse);
}

/**
 * Manual date picker - prompts user to enter a custom date
 * (OPTIONAL - Only needed if you want the menu option)
 */
function fetchPublicLawsCustomDate() {
  const ui = SpreadsheetApp.getUi();
  
  const response = ui.prompt(
    'Enter Custom Date',
    'Enter the date to search for laws (YYYY-MM-DD format):\nExample: 2025-12-19',
    ui.ButtonSet.OK_CANCEL
  );
  
  if (response.getSelectedButton() === ui.Button.OK) {
    const customDate = response.getResponseText().trim();
    
    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
      ui.alert('Invalid date format. Please use YYYY-MM-DD format (e.g., 2025-12-19)');
      return;
    }
    
    fetchPublicLaws(customDate);
  }
}

/**
 * Core function - fetches laws with optional custom date
 * @param {string|null} customDate - Optional date in YYYY-MM-DD format, or null for automatic
 */
function fetchPublicLaws(customDate) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const scrapedData = sheet.getSheetByName('Scraped Data');
  const postData = sheet.getSheetByName('Post Components');
  
  // Clear and set headers - NOW INCLUDING VOTE COLUMNS
  scrapedData.clear();
  scrapedData.appendRow([
    'Law Name', 
    'CRS Summary', 
    'Date', 
    'Law URL',
    'Num of House Dem Yeas',
    'Num of House Rep Yeas'
  ]);
  postData.getRange('D:D').clearContent();

  // Get current date/time for maxUploadDate
  const now = new Date();
  
  let dateStr;
  
  if (customDate) {
    // USE CUSTOM DATE
    dateStr = customDate;
    Logger.log(`Using custom date: ${dateStr}`);
  } else {
    // USE AUTOMATIC DATE (3 days ago)
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(now.getDate() - 3);
    dateStr = threeDaysAgo.toISOString().substring(0, 10);
    Logger.log(`Using automatic date (3 days ago): ${dateStr}`);
  }

  // Build timestamps
  const becameLawDate = `${dateStr}T00:00:00Z`;
  const maxUploadDate = now.toISOString();

  // Congressional session 119
  const congress = 119;
  
  const results = [];
  
  // Base scraping URL
  const url = `${BASE_URL}/law/${congress}?api_key=${API_KEY}&format=json&limit=500&fromDateTime=${becameLawDate}&toDateTime=${maxUploadDate}`;

  Logger.log(`Searching from ${becameLawDate} to ${maxUploadDate}`);

  // Scrape bills
  try {
    const response = UrlFetchApp.fetch(url);
    const data = JSON.parse(response.getContentText());
    
    Logger.log(`Found ${data.bills ? data.bills.length : 0} bills in date range`);

    if (!data.bills || data.bills.length === 0) {
      scrapedData.appendRow(['No laws found', '', '', '', '', '']);
      return;
    }

    // Filter for bills that became law on target date
    for (const bill of data.bills) {
      
      if (bill.latestAction.actionDate === dateStr &&
          bill.latestAction.text.includes('Became Public Law')) {
        
        // Fetch summary
        const summary = fetchSummary(congress, bill.type.toLowerCase(), bill.number);
        
        // Format the date for the spreadsheet
        const formattedDate = formatDateStr(bill.latestAction.actionDate);

        const govURL = findPublicUrl(bill.type, bill.number);
        
        // Fetch House roll call number and vote data
        const rollCallNum = getHouseRollCallNumber(congress, bill.type.toLowerCase(), bill.number);
        const voteData = rollCallNum ? fetchHouseVotesByRollCall(congress, rollCallNum) : { demYeas: 'N/A', repYeas: 'N/A' };

        // Push law data including vote counts
        results.push([
          bill.title || 'Unknown',
          summary,
          formattedDate,
          govURL,
          voteData.demYeas,
          voteData.repYeas
        ]);
        
        Logger.log(`Found: ${bill.title}`);
        Logger.log(`  House Votes - Dem Yeas: ${voteData.demYeas}, Rep Yeas: ${voteData.repYeas}`);
      }
    }
    
  } catch (error) {
    Logger.log('Error: ' + error.toString());
  }
  
  // Write results in sheet
  if (results.length === 0) {
    scrapedData.appendRow(['No laws found', '', '', '', '', '']);
  } else {
    results.forEach(row => scrapedData.appendRow(row));
  }
  
  scrapedData.autoResizeColumns(1, 6);
  
  Logger.log(`Complete! Found ${results.length} law(s) that became public on ${dateStr}`);
}

/**
 * Get House roll call number for a bill by fetching actions
 * Returns the most recent House roll call number
 */
function getHouseRollCallNumber(congress, billType, billNumber) {
  try {
    // Step 1: Get bill to find actions URL
    const billUrl = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}?api_key=${API_KEY}&format=json`;
    const billResponse = UrlFetchApp.fetch(billUrl);
    const billData = JSON.parse(billResponse.getContentText());
    
    if (!billData.bill || !billData.bill.actions || !billData.bill.actions.url) {
      Logger.log(`  No actions URL for ${billType.toUpperCase()} ${billNumber}`);
      return null;
    }
    
    // Step 2: Fetch actions
    const actionsUrl = `${billData.bill.actions.url}&api_key=${API_KEY}`;
    const actionsResponse = UrlFetchApp.fetch(actionsUrl);
    const actionsData = JSON.parse(actionsResponse.getContentText());
    
    if (!actionsData.actions || actionsData.actions.length === 0) {
      Logger.log(`  No actions found for ${billType.toUpperCase()} ${billNumber}`);
      return null;
    }
    
    // Step 3: Find the most recent House roll call vote
    let latestRollCall = null;
    
    for (const action of actionsData.actions) {
      if (action.recordedVotes && action.recordedVotes.length > 0) {
        for (const recordedVote of action.recordedVotes) {
          if (recordedVote.chamber === 'House' && recordedVote.rollNumber) {
            // Take the first one we find (actions are typically in reverse chronological order)
            latestRollCall = recordedVote.rollNumber;
            Logger.log(`  Found House roll call: ${latestRollCall}`);
            return latestRollCall;
          }
        }
      }
    }
    
    Logger.log(`  No House roll call found for ${billType.toUpperCase()} ${billNumber}`);
    return null;
    
  } catch (error) {
    Logger.log(`  Error getting roll call for ${billType.toUpperCase()} ${billNumber}: ${error.toString()}`);
    return null;
  }
}

/**
 * Fetch House vote data using roll call number
 * Returns Democrat and Republican yea vote counts
 */
function fetchHouseVotesByRollCall(congress, rollCallNumber) {
  const defaultVotes = { demYeas: 'N/A', repYeas: 'N/A' };
  
  try {
    // Determine session number
    const sessionNumber = 1
    
    // Fetch roll call vote details
    const rollCallUrl = `https://api.congress.gov/v3/house-vote/${congress}/${sessionNumber}/${rollCallNumber}?api_key=${API_KEY}`;
    const rollCallResponse = UrlFetchApp.fetch(rollCallUrl);
    const rollCallData = JSON.parse(rollCallResponse.getContentText());
    
    // Extract party vote totals
    if (!rollCallData.houseRollCallVote || !rollCallData.houseRollCallVote.votePartyTotal) {
      Logger.log(`  No vote party totals in roll call ${rollCallNumber}`);
      return defaultVotes;
    }
    
    let demYeas = 'N/A';
    let repYeas = 'N/A';
    
    for (const item of rollCallData.houseRollCallVote.votePartyTotal) {
      if (item.party && item.party.type) {
        if (item.party.type === 'D') {
          demYeas = item.yeaTotal || 0;
        } else if (item.party.type === 'R') {
          repYeas = item.yeaTotal || 0;
        }
      }
    }
    
    return { demYeas, repYeas };
    
  } catch (error) {
    Logger.log(`  Error fetching vote data for roll call ${rollCallNumber}: ${error.toString()}`);
    return defaultVotes;
  }
}


// Fetch CRS summaries
function fetchSummary(congress, billType, billNumber) {
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}?api_key=${API_KEY}&format=json`;
  
  try {
    const response = UrlFetchApp.fetch(url);
    const data = JSON.parse(response.getContentText());
    
    if (!data.bill || !data.bill.summaries || !data.bill.summaries.url) {
      return 'No summary accessed';
    }
    
    const summariesUrl = `${data.bill.summaries.url}&api_key=${API_KEY}`;
    const summariesResponse = UrlFetchApp.fetch(summariesUrl);
    const summariesData = JSON.parse(summariesResponse.getContentText());
    
    if (!summariesData.summaries || summariesData.summaries.length === 0) {
      return 'No summary available';
    }
    
    const summary = summariesData.summaries[summariesData.summaries.length - 1];
    return summary.text || 'No summary text';
    
  } catch (error) {
    return 'Error fetching summary';
  }
}

// Format date string
function formatDateStr(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

// Create congress.gov URL
function findPublicUrl(type, num) {
  const t = type.toLowerCase();
  const map = {
    hr:  "house-bill",
    s:   "senate-bill",
    hjres: "house-joint-resolution",
    sjres: "senate-joint-resolution"
  };

  const path = map[t];
  if (!path) return "";

  return `https://www.congress.gov/bill/119th-congress/${path}/${num}`;
}
