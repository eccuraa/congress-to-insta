// ============================================================
// Config.gs — Global constants for congress-to-insta
// All sheet names, column indexes, and API settings live here.
// Update this file if you rename columns or sheets.
// ============================================================

// ----------------------
// SHEET NAMES
// ----------------------
const SHEET_NAMES = {
  scrapedData: "Scraped Data",
  postComponents: "Post Components",
};

// ----------------------
// "Scraped Data" columns (1-indexed)
// ----------------------
const SCRAPED_COL = {
  lawName: 1,
  crsSummary: 2,
  date: 3,
  lawUrl: 4,
  houseDemYeas: 5,
  houseRepYeas: 6,
  senateDemYeas: 7,
  senateRepYeas: 8,
  senateIndYeas: 9,
  houseIndYeas: 10,
};

// ----------------------
// "Post Components" columns (1-indexed)
// ----------------------
const POST_COL = {
  caption: 1,
  visualSummary: 2,
  pctSenateInd: 3,
  pctHouseInd: 4,
  pctSenateDem: 5,
  pctHouseDem: 6,
  pctSenateRep: 7,
  pctHouseRep: 8,
  imageUrl: 9,
  timestamp: 10,
  postStatus: 11,
};

// ----------------------
// POST STATUS VALUES
// ----------------------
const POST_STATUS = {
  posted: "✓ Posted",
  error: "✗ Error",
};

// ----------------------
// API CONFIG
// ----------------------
const CONFIG = {
  templateId: "1xhn0sgndIIoQT53elvLnpyebWzXsd027XN0EgsEVJRI",
  spreadsheetId: "",
  imgbbApiKey: "YOUR_IMGBB_API_KEY_HERE",
  cloudFunctionUrl: "https://us-central1-voting-plot-matplotlib.cloudfunctions.net/generate_arc_image",
};

const ANTHROPIC_API_KEY = "API_KEY_HERE";
const MODEL = "claude-sonnet-4-20250514";

const INSTAGRAM = {
  accessToken: "API_KEY_HERE",
  accountId: "ACC_ID_HERE",
  delayBetweenPosts: 300,
  containerWaitTime: 10000,
};

// ----------------------
// CONGRESS API CONFIG
// ----------------------
const CONGRESS_API_KEY = "YOUR_API_KEY_HERE";
const CONGRESS_BASE_URL = "https://api.congress.gov/v3";
const CONGRESS_NUM = 119;
const SESSION_NUM = 2;