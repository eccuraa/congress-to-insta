// ============================================================
// scrapingScript.gs — Fetches public laws from Congress.gov API
// Depends on: 0_Config.gs (CONGRESS_API_KEY, CONGRESS_BASE_URL,
//             CONGRESS_NUM, SESSION_NUM, SHEET_NAMES, SCRAPED_COL)
// ============================================================

// ===== DATE CONFIGURATION =====
const USE_CUSTOM_DATE = true;
const CUSTOM_DATE = "2026-02-03";
// ==============================

// ============================================================
// CLASS: CongressApiClient
// Handles all HTTP requests to the Congress.gov API
// ============================================================
class CongressApiClient {
  constructor(apiKey, baseUrl, congress, sessionNumber) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.congress = congress;
    this.sessionNumber = sessionNumber;
  }

  _fetch(url) {
    return JSON.parse(UrlFetchApp.fetch(url).getContentText());
  }

  fetchLaws(fromDateTime, toDateTime) {
    const url = `${this.baseUrl}/law/${this.congress}?api_key=${this.apiKey}&format=json&limit=500&fromDateTime=${fromDateTime}&toDateTime=${toDateTime}`;
    return this._fetch(url).bills || [];
  }

  fetchBillActions(billType, billNumber) {
    const url = `${this.baseUrl}/bill/${this.congress}/${billType}/${billNumber}?api_key=${this.apiKey}&format=json`;
    const data = this._fetch(url);
    if (!data.bill?.actions?.url) return [];
    const actionsUrl = `${data.bill.actions.url}&limit=250&api_key=${this.apiKey}`;
    return this._fetch(actionsUrl).actions || [];
  }

  fetchSummary(billType, billNumber) {
    const url = `${this.baseUrl}/bill/${this.congress}/${billType}/${billNumber}?api_key=${this.apiKey}&format=json`;
    const data = this._fetch(url);
    if (!data.bill?.summaries?.url) return "No summary accessed";
    const summariesData = this._fetch(`${data.bill.summaries.url}&api_key=${this.apiKey}`);
    if (!summariesData.summaries?.length) return "No summary available";
    return summariesData.summaries[summariesData.summaries.length - 1].text || "No summary text";
  }

  fetchHouseVotes(houseVoteID) {
    const defaultVotes = { demYeas: "N/A", repYeas: "N/A", indYeas: "N/A" };
    try {
      const url = `${this.baseUrl}/house-vote/${this.congress}/${this.sessionNumber}/${houseVoteID}?api_key=${this.apiKey}&format=json`;
      const data = this._fetch(url);
      if (!data.houseRollCallVote?.votePartyTotal) return defaultVotes;

      let { demYeas, repYeas, indYeas } = defaultVotes;
      for (const item of data.houseRollCallVote.votePartyTotal) {
        if (item.party?.type === "D") demYeas = item.yeaTotal || 0;
        else if (item.party?.type === "R") repYeas = item.yeaTotal || 0;
        else if (item.party?.type === "I") indYeas = item.yeaTotal || 0;
      }
      return { demYeas, repYeas, indYeas };
    } catch (error) {
      Logger.log(`  Error fetching House votes for roll call ${houseVoteID}: ${error}`);
      return defaultVotes;
    }
  }

  fetchSenateVotes(senateVoteID) {
    const urlVoteNum = String(senateVoteID).padStart(5, "0");
    const url = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${this.congress}${this.sessionNumber}/vote_${this.congress}_${this.sessionNumber}_${urlVoteNum}.xml`;
    const root = XmlService.parse(UrlFetchApp.fetch(url).getContentText()).getRootElement();

    const totalYeas = parseInt(root.getChild("count").getChild("yeas").getText());
    let demYeas = 0, repYeas = 0, indYeas = 0;

    for (const member of root.getChild("members").getChildren("member")) {
      const party = member.getChild("party").getText();
      const vote = member.getChild("vote_cast").getText();
      if (vote === "Yea") {
        if (party === "D") demYeas++;
        else if (party === "R") repYeas++;
        else if (party === "I") indYeas++;
      }
    }

    if (demYeas + repYeas + indYeas !== totalYeas) {
      Logger.log(`Assert failed: ${demYeas} + ${repYeas} + ${indYeas} !== ${totalYeas}`);
    }

    return { demYeas, repYeas, indYeas };
  }
}

// ============================================================
// CLASS: VoteIdResolver
// Extracts House and Senate vote IDs from bill actions
// ============================================================
class VoteIdResolver {
  resolve(actions) {
    let houseVoteID = null;
    let senateVoteID = null;

    for (const action of actions) {
      if (action.recordedVotes?.length > 0) {
        for (const vote of action.recordedVotes) {
          if (vote.chamber === "House" && !houseVoteID) {
            houseVoteID = vote.rollNumber;
            Logger.log(`  Found house vote ID: ${houseVoteID}`);
          } else if (vote.chamber === "Senate" && !senateVoteID) {
            senateVoteID = vote.rollNumber;
            Logger.log(`  Found senate vote ID: ${senateVoteID}`);
          }
        }
      }
      if (houseVoteID && senateVoteID) break;
    }

    return { houseVoteID, senateVoteID };
  }
}

// ============================================================
// CLASS: SheetWriter
// Handles all read/write operations to Google Sheets
// ============================================================
class SheetWriter {
  constructor() {
    this.ss = SpreadsheetApp.getActiveSpreadsheet();
    this.scrapedSheet = this.ss.getSheetByName(SHEET_NAMES.scrapedData);
    this.postSheet = this.ss.getSheetByName(SHEET_NAMES.postComponents);
  }

  clearAndSetHeaders() {
    this.scrapedSheet.clear();
    this.scrapedSheet.appendRow([
      "Law Name", "CRS Summary", "Date", "Law URL",
      "Num of House Dem Yeas", "Num of House Rep Yeas",
      "Num of Senate Dem Yeas", "Num of Senate Rep Yeas",
      "Num of Senate Ind Yeas", "Num of House Ind Yeas",
    ]);
  }

  writeResults(results) {
    if (results.length === 0) {
      this.scrapedSheet.appendRow(["No laws found", "", "", "", "", ""]);
    } else {
      results.forEach((row) => this.scrapedSheet.appendRow(row));
    }
    this.scrapedSheet.autoResizeColumns(1, 6);
  }
}

// ============================================================
// CLASS: LawScraper
// Orchestrates the full scraping pipeline
// ============================================================
class LawScraper {
  constructor() {
    this.api = new CongressApiClient(
      CONGRESS_API_KEY,
      CONGRESS_BASE_URL,
      CONGRESS_NUM,
      SESSION_NUM
    );
    this.voteResolver = new VoteIdResolver();
    this.sheetWriter = new SheetWriter();
  }

  _getDateStr(customDate) {
    if (customDate) {
      Logger.log(`Using custom date: ${customDate}`);
      return customDate;
    }
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const dateStr = threeDaysAgo.toISOString().substring(0, 10);
    Logger.log(`Using automatic date (3 days ago): ${dateStr}`);
    return dateStr;
  }

  _buildLawRow(bill, dateStr) {
    const billType = bill.type.toLowerCase();

    const summary = this.api.fetchSummary(billType, bill.number);
    const formattedDate = LawScraper._formatDateStr(dateStr);
    const govURL = LawScraper._buildCongressUrl(bill.type, bill.number);

    const actions = this.api.fetchBillActions(billType, bill.number);
    const { houseVoteID, senateVoteID } = this.voteResolver.resolve(actions);

    if (!houseVoteID) {
      Logger.log(`⊗ Removing "${bill.title}" — voice vote, no recorded roll call`);
      return null;
    }

    const houseVotes = this.api.fetchHouseVotes(houseVoteID);
    const senateVotes = senateVoteID
      ? this.api.fetchSenateVotes(senateVoteID)
      : { demYeas: "N/A", repYeas: "N/A", indYeas: "N/A" };

    Logger.log(`Found: ${bill.title}`);
    Logger.log(`  House  — Dem: ${houseVotes.demYeas}, Rep: ${houseVotes.repYeas}, Ind: ${houseVotes.indYeas}`);
    Logger.log(`  Senate — Dem: ${senateVotes.demYeas}, Rep: ${senateVotes.repYeas}, Ind: ${senateVotes.indYeas}`);

    return [
      bill.title || "Unknown",   // SCRAPED_COL.lawName      = 1
      summary,                   // SCRAPED_COL.crsSummary   = 2
      formattedDate,             // SCRAPED_COL.date         = 3
      govURL,                    // SCRAPED_COL.lawUrl       = 4
      houseVotes.demYeas,        // SCRAPED_COL.houseDemYeas = 5
      houseVotes.repYeas,        // SCRAPED_COL.houseRepYeas = 6
      senateVotes.demYeas,       // SCRAPED_COL.senateDemYeas = 7
      senateVotes.repYeas,       // SCRAPED_COL.senateRepYeas = 8
      senateVotes.indYeas,       // SCRAPED_COL.senateIndYeas = 9
      houseVotes.indYeas,        // SCRAPED_COL.houseIndYeas  = 10
    ];
  }

  // Static utility: no instance data needed
  static _formatDateStr(dateStr) {
    return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });
  }

  static _buildCongressUrl(type, num) {
    const map = {
      hr: "house-bill",
      s: "senate-bill",
      hjres: "house-joint-resolution",
      sjres: "senate-joint-resolution",
    };
    const path = map[type.toLowerCase()];
    return path ? `https://www.congress.gov/bill/${CONGRESS_NUM}th-congress/${path}/${num}` : "";
  }

  run(customDate = null) {
    const dateStr = this._getDateStr(customDate);
    const becameLawDate = `${dateStr}T00:00:00Z`;
    const maxUploadDate = new Date().toISOString();

    Logger.log(`Searching from ${becameLawDate} to ${maxUploadDate}`);
    this.sheetWriter.clearAndSetHeaders();

    const results = [];

    try {
      const bills = this.api.fetchLaws(becameLawDate, maxUploadDate);
      Logger.log(`Found ${bills.length} bills in date range`);

      for (const bill of bills) {
        if (
          bill.latestAction.actionDate === dateStr &&
          bill.latestAction.text.includes("Became Public Law")
        ) {
          try {
            const row = this._buildLawRow(bill, dateStr);
            if (row) results.push(row);
          } catch (error) {
            Logger.log(`  Error processing "${bill.title}": ${error}`);
          }
        }
      }
    } catch (error) {
      Logger.log(`Error fetching laws: ${error}`);
    }

    this.sheetWriter.writeResults(results);
    Logger.log(`Complete! Found ${results.length} law(s) that became public on ${dateStr}`);
  }
}

// ============================================================
// ENTRY POINTS
// ============================================================
function fetchPublicLawsToday() {
  const dateToUse = USE_CUSTOM_DATE ? CUSTOM_DATE : null;
  new LawScraper().run(dateToUse);
}

function fetchPublicLaws(customDate) {
  new LawScraper().run(customDate);
}
