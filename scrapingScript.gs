// ============================================================
// Congress.gov API - Fetch Public Laws
// 
// This script queries the Congress.gov API to find bills that
// recently became public law, fetches their CRS summaries,
// and records House vote counts broken down by party.
//
// Results are written to two sheets in the active spreadsheet:
//   - "Scraped Data"    : Raw law data (title, summary, votes, etc.)
//   - "Post Components" : Column D is cleared on each run
// ============================================================

const API_KEY = 'API_KEY_HERE';
const BASE_URL = 'https://api.congress.gov/v3';

// ===== DATE CONFIGURATION =====
// Set USE_CUSTOM_DATE to true to use CUSTOM_DATE, or false to use automatic (3 days ago)
const USE_CUSTOM_DATE = false;           // Change to false for automatic mode
const CUSTOM_DATE = '2025-12-19';        // Only used if USE_CUSTOM_DATE is true
// ==============================


/**
 * Entry point for scheduled or manual runs.
 *
 * Reads the USE_CUSTOM_DATE / CUSTOM_DATE constants at the top of the file
 * and delegates to fetchPublicLaws() with the appropriate date string (or
 * null to trigger the automatic "3 days ago" logic).
 */
function fetchPublicLawsToday() {
  const dateToUse = USE_CUSTOM_DATE ? CUSTOM_DATE : null;
  fetchPublicLaws(dateToUse);
}


/**
 * Prompts the user to type a date in a dialog box, validates the input,
 * and calls fetchPublicLaws() with that date.
 *
 * This function is optional — it only needs to be wired to a menu item if
 * you want an interactive "pick a date" option inside the spreadsheet UI.
 */
function fetchPublicLawsCustomDate() {
  const ui = SpreadsheetApp.getUi();
  
  const response = ui.prompt(
    'Enter Custom Date',
    'Enter the date to search for laws (YYYY-MM-DD format):\nExample: 2025-12-19',
    ui.ButtonSet.OK_CANCEL
  );
  
  // Do nothing if the user dismissed the dialog
  if (response.getSelectedButton() === ui.Button.OK) {
    const customDate = response.getResponseText().trim();
    
    // Reject anything that doesn't look like YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
      ui.alert('Invalid date format. Please use YYYY-MM-DD format (e.g., 2025-12-19)');
      return;
    }
    
    fetchPublicLaws(customDate);
  }
}


/**
 * Core pipeline — fetches all public laws enacted on a given date.
 *
 * Steps performed:
 *   1. Clear and re-initialize the "Scraped Data" sheet with column headers.
 *   2. Determine the target date (custom or automatic).
 *   3. Query the Congress.gov /law endpoint for the 119th Congress within
 *      a [targetDate, now] window (max 500 results).
 *   4. Filter results to bills whose latest action was on the target date
 *      and whose action text contains "Became Public Law".
 *   5. For each matching bill, fetch its CRS summary, build its congress.gov
 *      URL, look up its House roll-call number, and retrieve party-level
 *      yea vote counts.
 *   6. Write all collected rows to the "Scraped Data" sheet.
 *
 * @param {string|null} customDate - A date string in "YYYY-MM-DD" format to
 *     search for laws, or null to automatically use a date 3 days in the past.
 */
function fetchPublicLaws(customDate) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const scrapedData = sheet.getSheetByName('Scraped Data');
  const postData = sheet.getSheetByName('Post Components');
  
  // Reset the output sheet and add column headers
  scrapedData.clear();
  scrapedData.appendRow([
    'Law Name', 
    'CRS Summary', 
    'Date', 
    'Law URL',
    'Num of House Dem Yeas',
    'Num of House Rep Yeas'
  ]);

  // Clear column D of Post Components so stale data isn't left behind
  postData.getRange('D:D').clearContent();

  // Capture the current timestamp so it can be used as the upper bound of
  // the date-range query (toDateTime)
  const now = new Date();
  
  let dateStr;
  
  if (customDate) {
    // User supplied an explicit date — use it as-is
    dateStr = customDate;
    Logger.log(`Using custom date: ${dateStr}`);
  } else {
    // Default mode: look 3 days into the past to account for processing delays
    // between when a bill is signed and when it appears in the Congress.gov API
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(now.getDate() - 3);
    dateStr = threeDaysAgo.toISOString().substring(0, 10); // Trim to "YYYY-MM-DD"
    Logger.log(`Using automatic date (3 days ago): ${dateStr}`);
  }

  // Build ISO-8601 timestamps required by the Congress.gov API
  const becameLawDate = `${dateStr}T00:00:00Z`; // Midnight on the target date
  const maxUploadDate = now.toISOString();        // Right now

  // The 119th Congress is the current session (started January 2025)
  const congress = 119;
  
  // Accumulate rows here before bulk-writing to the sheet
  const results = [];
  
  // Fetch up to 500 laws updated between the target date and now
  const url = `${BASE_URL}/law/${congress}?api_key=${API_KEY}&format=json&limit=500&fromDateTime=${becameLawDate}&toDateTime=${maxUploadDate}`;

  Logger.log(`Searching from ${becameLawDate} to ${maxUploadDate}`);

  try {
    const response = UrlFetchApp.fetch(url);
    const data = JSON.parse(response.getContentText());
    
    Logger.log(`Found ${data.bills ? data.bills.length : 0} bills in date range`);

    // Nothing to process if the API returned an empty list
    if (!data.bills || data.bills.length === 0) {
      scrapedData.appendRow(['No laws found', '', '', '', '', '']);
      return;
    }

    // Iterate over each bill returned and keep only those that:
    //   (a) have a latest action dated on the target day, AND
    //   (b) whose action text confirms it "Became Public Law"
    for (const bill of data.bills) {
      
      if (bill.latestAction.actionDate === dateStr &&
          bill.latestAction.text.includes('Became Public Law')) {
        
        // Fetch the CRS-authored plain-language summary for this bill
        const summary = fetchSummary(congress, bill.type.toLowerCase(), bill.number);
        
        // Convert "YYYY-MM-DD" to a human-readable string, e.g. "December 19, 2025"
        const formattedDate = formatDateStr(bill.latestAction.actionDate);

        // Build the canonical congress.gov URL for the bill
        const govURL = findPublicUrl(bill.type, bill.number);
        
        // Look up the House roll-call vote number from the bill's action history,
        // then use it to retrieve Democrat and Republican yea vote totals
        const rollCallNum = getHouseRollCallNumber(congress, bill.type.toLowerCase(), bill.number);
        const voteData = rollCallNum
          ? fetchHouseVotesByRollCall(congress, rollCallNum)
          : { demYeas: 'N/A', repYeas: 'N/A' }; // No roll call found — mark as N/A

        // Assemble the row for this law
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
  
  // Write all collected rows to the sheet, or indicate nothing was found
  if (results.length === 0) {
    scrapedData.appendRow(['No laws found', '', '', '', '', '']);
  } else {
    results.forEach(row => scrapedData.appendRow(row));
  }
  
  // Auto-fit column widths so the content is readable without manual resizing
  scrapedData.autoResizeColumns(1, 6);
  
  Logger.log(`Complete! Found ${results.length} law(s) that became public on ${dateStr}`);
}


/**
 * Finds the most recent House roll-call vote number for a given bill.
 *
 * The function works in two steps:
 *   1. Fetch the bill's detail record to obtain the actions list URL.
 *   2. Iterate over the actions in reverse-chronological order and return
 *      the roll number of the first House recorded vote encountered.
 *
 * @param {number} congress    - Congress session number (e.g. 119).
 * @param {string} billType    - Lowercase bill type (e.g. "hr", "s", "hjres").
 * @param {number} billNumber  - The bill number.
 * @returns {number|null} The House roll-call number, or null if none exists.
 */
function getHouseRollCallNumber(congress, billType, billNumber) {
  try {
    // Step 1: Fetch the bill detail to retrieve the nested actions URL
    const billUrl = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}?api_key=${API_KEY}&format=json`;
    const billResponse = UrlFetchApp.fetch(billUrl);
    const billData = JSON.parse(billResponse.getContentText());
    
    // Guard against bills that have no actions URL in their detail record
    if (!billData.bill || !billData.bill.actions || !billData.bill.actions.url) {
      Logger.log(`  No actions URL for ${billType.toUpperCase()} ${billNumber}`);
      return null;
    }
    
    // Step 2: Fetch the full list of legislative actions for this bill
    const actionsUrl = `${billData.bill.actions.url}&api_key=${API_KEY}`;
    const actionsResponse = UrlFetchApp.fetch(actionsUrl);
    const actionsData = JSON.parse(actionsResponse.getContentText());
    
    if (!actionsData.actions || actionsData.actions.length === 0) {
      Logger.log(`  No actions found for ${billType.toUpperCase()} ${billNumber}`);
      return null;
    }
    
    // Step 3: Walk through actions (newest first) and return the roll number
    // from the first House recorded vote we encounter
    let latestRollCall = null;
    
    for (const action of actionsData.actions) {
      // Only some actions contain a recordedVotes array
      if (action.recordedVotes && action.recordedVotes.length > 0) {
        for (const recordedVote of action.recordedVotes) {
          if (recordedVote.chamber === 'House' && recordedVote.rollNumber) {
            latestRollCall = recordedVote.rollNumber;
            Logger.log(`  Found House roll call: ${latestRollCall}`);
            return latestRollCall; // Return immediately — we only need the latest
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
 * Fetches Democrat and Republican yea vote totals for a House roll-call vote.
 *
 * Calls the /house-vote endpoint for session 1 of the given Congress and
 * parses the votePartyTotal array, looking for entries with party type "D"
 * (Democrat) and "R" (Republican).
 *
 * @param {number} congress        - Congress session number (e.g. 119).
 * @param {number} rollCallNumber  - The House roll-call vote number.
 * @returns {{ demYeas: number|string, repYeas: number|string }}
 *     An object with yea totals for each party, or 'N/A' if unavailable.
 */
function fetchHouseVotesByRollCall(congress, rollCallNumber) {
  // Default return value used whenever data cannot be retrieved
  const defaultVotes = { demYeas: 'N/A', repYeas: 'N/A' };
  
  try {
    // All votes in the 119th Congress so far are in session 1
    const sessionNumber = 1;
    
    // Fetch the detailed roll-call vote record
    const rollCallUrl = `https://api.congress.gov/v3/house-vote/${congress}/${sessionNumber}/${rollCallNumber}?api_key=${API_KEY}`;
    const rollCallResponse = UrlFetchApp.fetch(rollCallUrl);
    const rollCallData = JSON.parse(rollCallResponse.getContentText());
    
    // Guard: ensure the expected nested structure exists before accessing it
    if (!rollCallData.houseRollCallVote || !rollCallData.houseRollCallVote.votePartyTotal) {
      Logger.log(`  No vote party totals in roll call ${rollCallNumber}`);
      return defaultVotes;
    }
    
    let demYeas = 'N/A';
    let repYeas = 'N/A';
    
    // Parse each party entry — we only care about Democrats ("D") and Republicans ("R")
    for (const item of rollCallData.houseRollCallVote.votePartyTotal) {
      if (item.party && item.party.type) {
        if (item.party.type === 'D') {
          demYeas = item.yeaTotal || 0;  // Default to 0 if yeaTotal is missing/falsy
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


/**
 * Fetches the most recent CRS (Congressional Research Service) summary for a bill.
 *
 * The Congress.gov API returns summaries as a nested sub-resource. This function:
 *   1. Fetches the bill detail record to get the summaries sub-resource URL.
 *   2. Fetches that URL and returns the text of the last (most recent) summary.
 *
 * @param {number} congress    - Congress session number (e.g. 119).
 * @param {string} billType    - Lowercase bill type (e.g. "hr", "s").
 * @param {number} billNumber  - The bill number.
 * @returns {string} The plain-text summary, or a descriptive fallback string.
 */
function fetchSummary(congress, billType, billNumber) {
  const url = `${BASE_URL}/bill/${congress}/${billType}/${billNumber}?api_key=${API_KEY}&format=json`;
  
  try {
    const response = UrlFetchApp.fetch(url);
    const data = JSON.parse(response.getContentText());
    
    // Guard: bill detail must contain a summaries sub-resource URL
    if (!data.bill || !data.bill.summaries || !data.bill.summaries.url) {
      return 'No summary accessed';
    }
    
    // Fetch the summaries sub-resource
    const summariesUrl = `${data.bill.summaries.url}&api_key=${API_KEY}`;
    const summariesResponse = UrlFetchApp.fetch(summariesUrl);
    const summariesData = JSON.parse(summariesResponse.getContentText());
    
    if (!summariesData.summaries || summariesData.summaries.length === 0) {
      return 'No summary available';
    }
    
    // Take the last item — summaries are ordered oldest-to-newest, so the last
    // entry represents the most up-to-date version
    const summary = summariesData.summaries[summariesData.summaries.length - 1];
    return summary.text || 'No summary text';
    
  } catch (error) {
    return 'Error fetching summary';
  }
}


/**
 * Converts a "YYYY-MM-DD" date string into a locale-formatted string.
 *
 * Time is set to midnight to avoid off-by-one-day errors caused by timezone
 * conversions when constructing a Date object from a bare date string.
 *
 * @param {string} dateStr - A date string in "YYYY-MM-DD" format.
 * @returns {string} A formatted date such as "December 19, 2025".
 */
function formatDateStr(dateStr) {
  // Append T00:00:00 to prevent UTC vs. local timezone shift from rolling the date
  const date = new Date(dateStr + 'T00:00:00');
  const options = { year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString('en-US', options);
}


/**
 * Builds the canonical congress.gov URL for a given bill.
 *
 * @param {string} type   - Bill type in any case (e.g. "HR", "S", "HJRES", "SJRES").
 * @param {number} num    - The bill number.
 * @returns {string} The full congress.gov URL, or an empty string for unsupported types.
 *
 * @example
 *   findPublicUrl("HR", 1234)
 *   // => "https://www.congress.gov/bill/119th-congress/house-bill/1234"
 */
function findPublicUrl(type, num) {
  const t = type.toLowerCase();

  // Map each short bill-type code to the path segment used on congress.gov
  const map = {
    hr:    "house-bill",
    s:     "senate-bill",
    hjres: "house-joint-resolution",
    sjres: "senate-joint-resolution"
  };

  const path = map[t];

  // Return an empty string for any bill type not in the map (e.g. "hconres")
  if (!path) return "";

  return `https://www.congress.gov/bill/119th-congress/${path}/${num}`;
}
