// ============================================================
// toInstagram.gs — Posts images to Instagram from Google Sheet
// ============================================================

// ----------------------
// SHARED SHEET VARIABLES (defined once, used everywhere)
// ----------------------
const ss = SpreadsheetApp.getActiveSpreadsheet();
const postsSheet = ss.getSheetByName(SHEET_NAMES.postComponents);

// ============================================================
// MAIN FUNCTION: Post to Instagram from Sheet
// ============================================================
function imageUrlToInstaPipeline() {
  Logger.log("=== STARTING INSTAGRAM POSTING PIPELINE ===\n");

  if (!postsSheet) throw new Error(`Sheet "${SHEET_NAMES.postComponents}" not found`);

  const lastRow = postsSheet.getLastRow();
  let postsCreated = 0;

  for (let i = 2; i <= lastRow; i++) {
    const caption = postsSheet.getRange(i, POST_COL.caption).getValue();
    const imageUrl = postsSheet.getRange(i, POST_COL.imageUrl).getValue();
    const postStatus = postsSheet.getRange(i, POST_COL.postStatus).getValue();

    if (!caption) { Logger.log(`Row ${i}: Skipped (no caption)`); continue; }
    if (!imageUrl) { Logger.log(`Row ${i}: Skipped (no image URL)`); continue; }
    if (postStatus === POST_STATUS.posted) { Logger.log(`Row ${i}: Already posted, skipping`); continue; }

    try {
      Logger.log(`\n--- Processing Row ${i} ---`);
      Logger.log("Image URL: " + imageUrl);
      Logger.log("Caption: " + caption.substring(0, 50) + "...");

      const postId = postToInstagram(imageUrl.toString().trim(), caption.toString().trim());
      Logger.log("✓ Posted to Instagram! Media ID: " + postId);

      postsSheet.getRange(i, POST_COL.postStatus).setValue(POST_STATUS.posted);
      postsSheet.getRange(i, POST_COL.timestamp).setValue(new Date());
      postsCreated++;

      if (i < lastRow) {
        Logger.log(`Waiting ${INSTAGRAM.delayBetweenPosts / 1000} seconds before next post...`);
        Utilities.sleep(INSTAGRAM.delayBetweenPosts);
      }
    } catch (error) {
      Logger.log(`✗ ERROR on row ${i}: ${error.toString()}`);
      postsSheet.getRange(i, POST_COL.postStatus).setValue(POST_STATUS.error);
      postsSheet.getRange(i, POST_COL.timestamp).setValue(error.message);
    }
  }

  Logger.log(`\n=== POSTING PIPELINE COMPLETE ===`);
  Logger.log(`Posts created: ${postsCreated}`);
  return postsCreated;
}

// ============================================================
// INSTAGRAM API
// ============================================================
function postToInstagram(imageUrl, caption) {
  Logger.log("Creating Instagram container...");
  const containerId = createInstagramContainer(imageUrl, caption);
  Logger.log("Container created: " + containerId);

  Logger.log(`Waiting ${INSTAGRAM.containerWaitTime / 1000} seconds for processing...`);
  Utilities.sleep(INSTAGRAM.containerWaitTime);

  Logger.log("Publishing container...");
  const postId = publishInstagramContainer(containerId);
  Logger.log("Published! Media ID: " + postId);
  return postId;
}

function createInstagramContainer(imageUrl, caption) {
  const url = `https://graph.instagram.com/v23.0/${INSTAGRAM.accountId}/media`;
  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ image_url: imageUrl, caption, access_token: INSTAGRAM.accessToken }),
    muteHttpExceptions: true,
  });

  const responseCode = response.getResponseCode();
  const data = JSON.parse(response.getContentText());
  Logger.log("Create container response code: " + responseCode);

  if (responseCode !== 200) throw new Error(`Failed to create container. Status: ${responseCode}`);
  if (data.error) throw new Error("Instagram API error: " + JSON.stringify(data.error));
  return data.id;
}

function publishInstagramContainer(containerId) {
  const url = `https://graph.instagram.com/v23.0/${INSTAGRAM.accountId}/media_publish`;
  const response = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ creation_id: containerId, access_token: INSTAGRAM.accessToken }),
    muteHttpExceptions: true,
  });

  const responseCode = response.getResponseCode();
  const data = JSON.parse(response.getContentText());
  Logger.log("Publish response code: " + responseCode);

  if (responseCode !== 200) throw new Error(`Failed to publish. Status: ${responseCode}`);
  if (data.error) throw new Error("Instagram API error: " + JSON.stringify(data.error));
  return data.id;
}

// ============================================================
// TEST & UTILITY FUNCTIONS
// ============================================================
function testPostSingleRow() {
  const testRow = 2;
  Logger.log("=== TESTING SINGLE ROW POST ===");

  const imageUrl = postsSheet.getRange(testRow, POST_COL.imageUrl).getValue().toString().trim();
  const caption = postsSheet.getRange(testRow, POST_COL.caption).getValue().toString().trim();
  Logger.log("Image URL: " + imageUrl);
  Logger.log("Caption: " + caption);

  try {
    const postId = postToInstagram(imageUrl, caption);
    Logger.log("✓ Success! Media ID: " + postId);
    postsSheet.getRange(testRow, POST_COL.postStatus).setValue(POST_STATUS.posted);
    postsSheet.getRange(testRow, POST_COL.timestamp).setValue(new Date());
  } catch (error) {
    Logger.log("✗ Error: " + error.toString());
  }
  Logger.log("=== TEST COMPLETE ===");
}

function clearAllPostedMarkers() {
  const lastRow = postsSheet.getLastRow();
  for (let i = 2; i <= lastRow; i++) {
    postsSheet.getRange(i, POST_COL.postStatus).setValue("");
    postsSheet.getRange(i, POST_COL.timestamp).setValue("");
  }
  Logger.log("✓ Cleared all posted markers");
}

function getPostingStats() {
  const lastRow = postsSheet.getLastRow();
  let readyToPost = 0, alreadyPosted = 0, errors = 0, missingData = 0;

  for (let i = 2; i <= lastRow; i++) {
    const caption = postsSheet.getRange(i, POST_COL.caption).getValue();
    const imageUrl = postsSheet.getRange(i, POST_COL.imageUrl).getValue();
    const status = postsSheet.getRange(i, POST_COL.postStatus).getValue();

    if (!caption || !imageUrl) missingData++;
    else if (status === POST_STATUS.posted) alreadyPosted++;
    else if (status?.toString().includes("Error")) errors++;
    else readyToPost++;
  }

  Logger.log("=== POSTING STATISTICS ===");
  Logger.log("Ready to post: " + readyToPost);
  Logger.log("Already posted: " + alreadyPosted);
  Logger.log("Errors: " + errors);
  Logger.log("Missing data: " + missingData);
  Logger.log("Total rows: " + (lastRow - 1));
}
