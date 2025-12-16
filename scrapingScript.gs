// Congress.gov API - Fetch Public Laws
const API_KEY = 'API_KEY_HERE';
const BASE_URL = 'https://api.congress.gov/v3';

function fetchPublicLawsToday() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet()
  const scrapedData = sheet.getSheetByName('Scraped Data');
  const postData = sheet.getSheetByName('Post Components');
  
  
  // Clear and set headers
  scrapedData.clear();
  scrapedData.appendRow(['Law Name', 'CRS Summary', 'Date', 'Law URL']);
  postData.getRange('D:D').clearContent();

  // 1. Get the current date/time (for maxUploadDate)
  const now = new Date(); 

  // 2. Calculate the date 3 days ago (for becameLawDate and dateStr)
  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(now.getDate() - 3); 

  // Get the date string (YYYY-MM-DD) by stripping the time off the ISO string
  const dateStr = threeDaysAgo.toISOString().substring(0, 10);

  // The 'from' timestamp (4 days ago at midnight UTC)
  const becameLawDate = `${dateStr}T00:00:00Z`;

  // The 'to' timestamp (The current time in full ISO UTC format)
  const maxUploadDate = now.toISOString();

  // Congressional session 119, which is hardcoded as it will not change until 2027
  const congress = 119;
  
  const results = [];
  
  // Base scraping URL that accesses all bills that underwent some action on the given date
  const url = `${BASE_URL}/law/${congress}?api_key=${API_KEY}&format=json&limit=500&fromDateTime=${becameLawDate}&toDateTime=${maxUploadDate}`;

  // Scrape bills
  try {
    const response = UrlFetchApp.fetch(url);
    const data = JSON.parse(response.getContentText());
    
    // Log the number of bills that underwent some action or change on the given date (3 days ago from today)
    Logger.log(`Found ${data.bills.length} bills in date range`);


    // Filter for bills that became law on target date
    for (const bill of data.bills) {
      
      if (bill.latestAction.actionDate === dateStr &&
          bill.latestAction.text.includes('Became Public Law')) {
        
        // Fetch summary
        const summary = fetchSummary(congress, bill.type.toLowerCase(), bill.number);
        
        // Format the date for the spreadsheet
        const formattedDate = formatDateStr(bill.latestAction.actionDate);

        const govURL = findPublicUrl(bill.type, bill.number)
        
        // Push law data including the formatted date and URL
        results.push([
          bill.title || 'Unknown',
          summary,
          formattedDate, // New: The formatted date
          govURL       // New: The bill URL
        ]);
        
        // Report finding each bill by sending new law title to log
        Logger.log(`Found: ${bill.title}`);
      }
    }
    
  } catch (error) {
    Logger.log('Error: ' + error.toString());
  }
  
  
  // Write results in sheet
  if (results.length === 0) {
    scrapedData.appendRow(['No laws found', '']);
  } else {
    results.forEach(row => scrapedData.appendRow(row));
  }
  
  scrapedData.autoResizeColumns(1, 2);
}


// After knowing each bill number for the new laws, fetch their official CRS summaries.
function fetchSummary(congress, billType, billNumber) {

  // URL requiring bill number now, to access a specific bill rather than general search results.
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}?api_key=${API_KEY}&format=json`;
  
  try {
    const response = UrlFetchApp.fetch(url);
    const data = JSON.parse(response.getContentText());
    
    // If either the given bill, summary or URL does not exist, write error message in Google Sheet.
    if (!data.bill || !data.bill.summaries || !data.bill.summaries.url) {
      return 'No summary accessed';
    }
    
    // The API inputs
    const summariesUrl = `${data.bill.summaries.url}&api_key=${API_KEY}`;
    const summariesResponse = UrlFetchApp.fetch(summariesUrl);
    const summariesData = JSON.parse(summariesResponse.getContentText());
    
    // Another error message if summary section was left blank.
    if (!summariesData.summaries || summariesData.summaries.length === 0) {
      return 'No summary available';
    }
    
    // Get the latest summary by taking the most recent index ([number of summaries -1])
    const summary = summariesData.summaries[summariesData.summaries.length - 1];
    return summary.text || 'No summary text';
    
  } catch (error) {
    return 'Error fetching summary';
  }
}

/**
 * Formats a date string from YYYY-MM-DD to Month Day, Year (e.g., '2025-12-08' to 'December 8, 2025').
 * @param {string} dateStr The date string in YYYY-MM-DD format.
 * @returns {string} The formatted date string.
 */
function formatDateStr(dateStr) {
  const date = new Date(dateStr + 'T00:00:00'); // Append T00:00:00 to treat as UTC midnight for consistent parsing
  
  // Use a standard date formatter
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}

// Creates accurate URL based on bill details, such as where the bill was introduced.
function findPublicUrl(type, num) {
  const t = type.toLowerCase();

  // Congress.gov path mapping
  const map = {
    hr:  "house-bill",
    s:   "senate-bill",
    hjres: "house-joint-resolution",
    sjres: "senate-joint-resolution"
  };

  const path = map[t];
  if (!path) {
    // Fallback if an unexpected type appears
    return "";
  }

  return `https://www.congress.gov/bill/119th-congress/${path}/${num}`;
}

// Sets up Google Sheet, including column names.
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Congress.gov')
    .addItem('Fetch Laws', 'fetchPublicLawsToday')
    .addToUi();
}
