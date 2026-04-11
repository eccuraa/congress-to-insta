// ============================================================
// scrapingScript.gs — Fetches public laws from Congress.gov API
// Depends on: 0_Config.gs (CONGRESS_API_KEY, CONGRESS_BASE_URL,
//             CONGRESS_NUM, SESSION_NUM, SHEET_NAMES, SCRAPED_COL)
// ============================================================

// ===== DATE CONFIGURATION =====
const USE_CUSTOM_DATE = true;      // Change to false for automatic mode
const CUSTOM_DATE = "2026-02-03";  // Only used if USE_CUSTOM_DATE is true
// ==============================

/**
 * Main function - fetches laws based on configuration above
 */
function fetchPublicLawsToday() {
  const dateToUse = USE_CUSTOM_DATE ? CUSTOM_DATE : null;
  fetchPublicLaws(dateToUse);
}

/**
 * Core function - fetches laws with optional custom date
 * @param {string|null} customDate - Optional date in YYYY-MM-DD format, or null for automatic
 */
function fetchPublicLaws(customDate) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet();
  const scrapedData = sheet.getSheetByName(SHEET_NAMES.scrapedData);
  const postData = sheet.getSheetByName(SHEET_NAMES.postComponents);

  // Clear and set headers
  scrapedData.clear();
  scrapedData.appendRow([
    "Law Name",
    "CRS Summary",
    "Date",
    "Law URL",
    "Num of House Dem Yeas",
    "Num of House Rep Yeas",
    "Num of Senate Dem Yeas",
    "Num of Senate Rep Yeas",
    "Num of Senate Ind Yeas",
    "Num of House Ind Yeas",
  ]);
  postData.getRange("J2:H").clearContent();

  const now = new Date();
  let dateStr;

  if (customDate) {
    dateStr = customDate;
    Logger.log(`Using custom date: ${dateStr}`);
  } else {
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setDate(now.getDate() - 3);
    dateStr = threeDaysAgo.toISOString().substring(0, 10);
    Logger.log(`Using automatic date (3 days ago): ${dateStr}`);
  }

  const becameLawDate = `${dateStr}T00:00:00Z`;
  const maxUploadDate = now.toISOString();
  const results = [];

  const url = `${CONGRESS_BASE_URL}/law/${CONGRESS_NUM}?api_key=${CONGRESS_API_KEY}&format=json&limit=500&fromDateTime=${becameLawDate}&toDateTime=${maxUploadDate}`;
  Logger.log(`Searching from ${becameLawDate} to ${maxUploadDate}`);

  try {
    const response = UrlFetchApp.fetch(url);
    const data = JSON.parse(response.getContentText());

    Logger.log(`Found ${data.bills ? data.bills.length : 0} bills in date range`);

    if (!data.bills || data.bills.length === 0) {
      scrapedData.appendRow(["No laws found", "", "", "", "", ""]);
      return;
    }

    for (const bill of data.bills) {
      if (
        bill.latestAction.actionDate === dateStr &&
        bill.latestAction.text.includes("Became Public Law")
      ) {
        const summary = fetchSummary(CONGRESS_NUM, bill.type.toLowerCase(), bill.number);
        const formattedDate = formatDateStr(bill.latestAction.actionDate);
        const govURL = findPublicUrl(bill.type, bill.number);

        const { houseVoteID, senateVoteID } = getVoteIDs(CONGRESS_NUM, bill.type.toLowerCase(), bill.number);

        if (!houseVoteID) {
          Logger.log(`⊗ Removing "${bill.title}" from posting queue - not a yea-or-nay/recorded vote (voice vote)`);
          continue;
        }

        const houseVoteData = fetchHouseVotes(CONGRESS_NUM, SESSION_NUM, houseVoteID);
        const senateVoteData = senateVoteID
          ? fetchSenateVotes(CONGRESS_NUM, SESSION_NUM, senateVoteID)
          : { demYeas: "N/A", repYeas: "N/A", indYeas: "N/A" };

        // Order matches SCRAPED_COL in 0_Config.gs
        results.push([
          bill.title || "Unknown",   // SCRAPED_COL.lawName       = 1
          summary,                   // SCRAPED_COL.crsSummary     = 2
          formattedDate,             // SCRAPED_COL.date           = 3
          govURL,                    // SCRAPED_COL.lawUrl         = 4
          houseVoteData.demYeas,     // SCRAPED_COL.houseDemYeas   = 5
          houseVoteData.repYeas,     // SCRAPED_COL.houseRepYeas   = 6
          senateVoteData.demYeas,    // SCRAPED_COL.senateDemYeas  = 7
          senateVoteData.repYeas,    // SCRAPED_COL.senateRepYeas  = 8
          senateVoteData.indYeas,    // SCRAPED_COL.senateIndYeas  = 9
          houseVoteData.indYeas,     // SCRAPED_COL.houseIndYeas   = 10
        ]);

        Logger.log(`Found: ${bill.title}`);
        Logger.log(`  House Votes - Dem Yeas: ${houseVoteData.demYeas}, Rep Yeas: ${houseVoteData.repYeas}, Ind Yeas: ${houseVoteData.indYeas}`);
        Logger.log(`  Senate Votes - Dem Yeas: ${senateVoteData.demYeas}, Rep Yeas: ${senateVoteData.repYeas}, Ind Yeas: ${senateVoteData.indYeas}`);
      }
    }
  } catch (error) {
    Logger.log("Error: " + error.toString());
  }

  if (results.length === 0) {
    scrapedData.appendRow(["No laws found", "", "", "", "", ""]);
  } else {
    results.forEach((row) => scrapedData.appendRow(row));
  }

  scrapedData.autoResizeColumns(1, 6);
  Logger.log(`Complete! Found ${results.length} law(s) that became public on ${dateStr}`);
}

/**
 * Get House and Senate roll call vote IDs for a bill
 */
function getVoteIDs(congress, billType, billNumber) {
  try {
    const billUrl = `${CONGRESS_BASE_URL}/bill/${congress}/${billType}/${billNumber}?api_key=${CONGRESS_API_KEY}&format=json`;
    const billData = JSON.parse(UrlFetchApp.fetch(billUrl).getContentText());

    if (!billData.bill?.actions?.url) {
      Logger.log(`  No actions URL for ${billType.toUpperCase()} ${billNumber}`);
      return null;
    }

    const actionsUrl = `${billData.bill.actions.url}&limit=250&api_key=${CONGRESS_API_KEY}`;
    const actionsData = JSON.parse(UrlFetchApp.fetch(actionsUrl).getContentText());

    if (!actionsData.actions || actionsData.actions.length === 0) {
      Logger.log(`  No actions found for ${billType.toUpperCase()} ${billNumber}`);
      return null;
    }

    let houseVoteID = null;
    let senateVoteID = null;

    for (const action of actionsData.actions) {
      if (action.recordedVotes?.length > 0) {
        for (const recordedVote of action.recordedVotes) {
          if (recordedVote.chamber === "House" && !houseVoteID) {
            houseVoteID = recordedVote.rollNumber;
            Logger.log(`  Found house vote ID: ${houseVoteID}`);
          } else if (recordedVote.chamber === "Senate" && !senateVoteID) {
            senateVoteID = recordedVote.rollNumber;
            Logger.log(`  Found senate vote ID: ${senateVoteID}`);
          }
        }
      }
      if (houseVoteID && senateVoteID) break;
    }

    Logger.log(`  Found roll calls for ${billType.toUpperCase()} ${billNumber} — House: ${houseVoteID}, Senate: ${senateVoteID}`);
    return { houseVoteID, senateVoteID };
  } catch (error) {
    Logger.log(`  Error getting roll call for ${billType.toUpperCase()} ${billNumber}: ${error.toString()}`);
    return null;
  }
}

/**
 * Fetch House vote data using roll call number
 */
function fetchHouseVotes(congress, sessionNumber, houseVoteID) {
  const defaultVotes = { demYeas: "N/A", repYeas: "N/A", indYeas: "N/A" };

  try {
    const rollCallUrl = `${CONGRESS_BASE_URL}/house-vote/${congress}/${sessionNumber}/${houseVoteID}?api_key=${CONGRESS_API_KEY}&format=json`;
    const rollCallData = JSON.parse(UrlFetchApp.fetch(rollCallUrl).getContentText());

    if (!rollCallData.houseRollCallVote?.votePartyTotal) {
      Logger.log(`  No vote party totals in roll call ${houseVoteID}`);
      return defaultVotes;
    }

    let { demYeas, repYeas, indYeas } = defaultVotes;

    for (const item of rollCallData.houseRollCallVote.votePartyTotal) {
      if (item.party?.type === "D") demYeas = item.yeaTotal || 0;
      else if (item.party?.type === "R") repYeas = item.yeaTotal || 0;
      else if (item.party?.type === "I") indYeas = item.yeaTotal || 0;
    }

    return { demYeas, repYeas, indYeas };
  } catch (error) {
    Logger.log(`  Error fetching vote data for roll call ${houseVoteID}: ${error.toString()}`);
    return defaultVotes;
  }
}

/**
 * Fetch Senate vote data from senate.gov XML
 */
function fetchSenateVotes(congress, sessionNumber, senateVoteID) {
  const urlVoteNum = String(senateVoteID).padStart(5, "0");
  const url = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${sessionNumber}/vote_${congress}_${sessionNumber}_${urlVoteNum}.xml`;

  const root = XmlService.parse(UrlFetchApp.fetch(url).getContentText()).getRootElement();
  const totalYeas = parseInt(root.getChild("count").getChild("yeas").getText());

  let demYeas = 0, repYeas = 0, indYeas = 0;

  for (const member of root.getChild("members").getChildren("member")) {
    const party = member.getChild("party").getText();
    const vote = member.getChild("vote_cast").getText();
    if (vote === "Yea") {
      if (party === "D") demYeas++;
      if (party === "R") repYeas++;
      if (party === "I") indYeas++;
    }
  }

  if (demYeas + repYeas + indYeas !== totalYeas) {
    Logger.log(`Assert failed: demYeas (${demYeas}) + repYeas (${repYeas}) + indYeas (${indYeas}) !== totalYeas (${totalYeas})`);
  }

  return { demYeas, repYeas, indYeas };
}

/**
 * Fetch CRS summary for a bill
 */
function fetchSummary(congress, billType, billNumber) {
  const url = `${CONGRESS_BASE_URL}/bill/${congress}/${billType}/${billNumber}?api_key=${CONGRESS_API_KEY}&format=json`;

  try {
    const data = JSON.parse(UrlFetchApp.fetch(url).getContentText());

    if (!data.bill?.summaries?.url) return "No summary accessed";

    const summariesData = JSON.parse(
      UrlFetchApp.fetch(`${data.bill.summaries.url}&api_key=${CONGRESS_API_KEY}`).getContentText()
    );

    if (!summariesData.summaries?.length) return "No summary available";

    return summariesData.summaries[summariesData.summaries.length - 1].text || "No summary text";
  } catch (error) {
    return "Error fetching summary";
  }
}

/**
 * Format YYYY-MM-DD date string to readable format
 */
function formatDateStr(dateStr) {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Build congress.gov URL for a bill
 */
function findPublicUrl(type, num) {
  const map = {
    hr: "house-bill",
    s: "senate-bill",
    hjres: "house-joint-resolution",
    sjres: "senate-joint-resolution",
  };

  const path = map[type.toLowerCase()];
  if (!path) return "";

  return `https://www.congress.gov/bill/${CONGRESS_NUM}th-congress/${path}/${num}`;
}
