// ===== CONFIGURATION =====
const SETUP = {
  // Instagram API credentials
  instagramAccessToken: "API_KEY_HERE",
  instagramAccountId: "ACC_ID_HERE",
  
  // Posting settings
  delayBetweenPosts: 300, // ideally would be 5 minutes between posts (in milliseconds)
  containerWaitTime: 10000    // 10 seconds to wait for container creation
};

/**
 * ========================================
 * MAIN FUNCTION: Post to Instagram from Sheet
 * ========================================
 * Reads from "Post Components" sheet and posts to Instagram
 * Only posts rows that:
 * - Have a caption (column A)
 * - Have an image URL (column C)
 * - Are NOT already marked as posted (column D)
 * 
 * Set this up with a time-based trigger!
 */
function imageUrlToInstaPipeline() {
  Logger.log('=== STARTING INSTAGRAM POSTING PIPELINE ===\n');
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const postsSheet = ss.getSheetByName("Post Components");
  
  if (!postsSheet) {
    throw new Error('Sheet "Post Components" not found');
  }
  
  const lastRow = postsSheet.getLastRow();
  let postsCreated = 0;
  
  for (let i = 2; i <= lastRow; i++) {
    const captionCell = postsSheet.getRange(i, 1).getValue();
    const imageUrlCell = postsSheet.getRange(i, 3).getValue();
    const postStatusCell = postsSheet.getRange(i, 4).getValue();
    
    // Skip if no caption
    if (!captionCell) {
      Logger.log(`Row ${i}: Skipped (no caption)`);
      continue;
    }
    
    // Skip if no image URL
    if (!imageUrlCell) {
      Logger.log(`Row ${i}: Skipped (no image URL)`);
      continue;
    }
    
    // Skip if already posted
    if (postStatusCell === "✓ Posted") {
      Logger.log(`Row ${i}: Already posted, skipping`);
      continue;
    }
    
    try {
      Logger.log(`\n--- Processing Row ${i} ---`);
      
      // Get data from sheet
      const imageUrl = imageUrlCell.toString().trim();
      const caption = captionCell.toString().trim();
      
      Logger.log('Image URL: ' + imageUrl);
      Logger.log('Caption: ' + caption.substring(0, 50) + '...');
      
      // Post to Instagram
      const postId = postToInstagram(imageUrl, caption);
      Logger.log('✓ Posted to Instagram! Media ID: ' + postId);
      
      // Mark as posted
      postsSheet.getRange(i, 4).setValue("✓ Posted");
      postsSheet.getRange(i, 5).setValue(new Date()); // Timestamp in column F
      
      postsCreated++;
      
      // Wait between posts to avoid rate limits
      if (i < lastRow) {
        Logger.log(`Waiting ${SETUP.delayBetweenPosts / 1000} seconds before next post...`);
        Utilities.sleep(SETUP.delayBetweenPosts);
      }
      
    } catch (error) {
      Logger.log(`✗ ERROR on row ${i}: ${error.toString()}`);
      postsSheet.getRange(i, 4).setValue("✗ Error");
      postsSheet.getRange(i, 5).setValue(error.message); // Error details in column E
    }
  }
  
  Logger.log(`\n=== POSTING PIPELINE COMPLETE ===`);
  Logger.log(`Posts created: ${postsCreated}`);
  
  return postsCreated;
}

/**
 * ========================================
 * INSTAGRAM API: Post Image with Caption
 * ========================================
 * Two-step process:
 * 1. Create container (prepare the post)
 * 2. Publish container (make it live)
 */
function postToInstagram(imageUrl, caption) {
  // Step 1: Create container
  Logger.log('Creating Instagram container...');
  const containerId = createInstagramContainer(imageUrl, caption);
  Logger.log('Container created: ' + containerId);
  
  // Step 2: Wait for Instagram to process the container
  Logger.log(`Waiting ${SETUP.containerWaitTime / 1000} seconds for container processing...`);
  Utilities.sleep(SETUP.containerWaitTime);
  
  // Step 3: Publish the container
  Logger.log('Publishing container...');
  const postId = publishInstagramContainer(containerId);
  Logger.log('Published! Media ID: ' + postId);
  
  return postId;
}

/**
 * Create Instagram media container
 * This prepares the post but doesn't publish it yet
 */
function createInstagramContainer(imageUrl, caption) {
  const url = `https://graph.instagram.com/v23.0/${SETUP.instagramAccountId}/media`;
  
  const payload = {
    image_url: imageUrl,
    caption: caption,
    access_token: SETUP.instagramAccessToken
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();
  
  Logger.log('Create container response code: ' + responseCode);
  
  if (responseCode !== 200) {
    throw new Error('Failed to create container. Status: ' + responseCode + ', Response: ' + responseText);
  }
  
  const data = JSON.parse(responseText);
  
  if (data.error) {
    throw new Error('Instagram API error: ' + JSON.stringify(data.error));
  }
  
  return data.id; // This is the container ID
}

/**
 * Publish Instagram container
 * This makes the post go live on Instagram
 */
function publishInstagramContainer(containerId) {
  const url = `https://graph.instagram.com/v23.0/${SETUP.instagramAccountId}/media_publish`;
  
  const payload = {
    creation_id: containerId,
    access_token: SETUP.instagramAccessToken
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();
  
  Logger.log('Publish response code: ' + responseCode);
  
  if (responseCode !== 200) {
    throw new Error('Failed to publish. Status: ' + responseCode + ', Response: ' + responseText);
  }
  
  const data = JSON.parse(responseText);
  
  if (data.error) {
    throw new Error('Instagram API error: ' + JSON.stringify(data.error));
  }
  
  return data.id; // This is the published media ID
}

/**
 * ========================================
 * TEST FUNCTION: Post a Single Row
 * ========================================
 * Use this to test posting without running the full loop
 * Just specify the row number you want to test
 */
function testPostSingleRow() {
  const testRow = 2; // Change this to test different rows
  
  Logger.log('=== TESTING SINGLE ROW POST ===');
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const postsSheet = ss.getSheetByName("Post Components");
  
  const imageUrl = postsSheet.getRange(testRow, 3).getValue().toString().trim();
  const caption = postsSheet.getRange(testRow, 1).getValue().toString().trim();
  
  Logger.log('Image URL: ' + imageUrl);
  Logger.log('Caption: ' + caption);
  
  try {
    const postId = postToInstagram(imageUrl, caption);
    Logger.log('✓ Success! Media ID: ' + postId);
    
    // Mark as posted
    postsSheet.getRange(testRow, 4).setValue("✓ Posted");
    postsSheet.getRange(testRow, 6).setValue(new Date());
    
  } catch (error) {
    Logger.log('✗ Error: ' + error.toString());
  }
  
  Logger.log('=== TEST COMPLETE ===');
}

/**
 * ========================================
 * UTILITY: Clear All "Posted" Markers
 * ========================================
 * Use this if you want to re-post everything
 * (e.g., for testing or if something went wrong)
 */
function clearAllPostedMarkers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const postsSheet = ss.getSheetByName("Post Components");
  const lastRow = postsSheet.getLastRow();
  
  for (let i = 2; i <= lastRow; i++) {
    postsSheet.getRange(i, 4).setValue(""); // Clear column D
    postsSheet.getRange(i, 5).setValue(""); // Clear column E (errors)
    postsSheet.getRange(i, 6).setValue(""); // Clear column F (timestamps)
  }
  
  Logger.log('✓ Cleared all posted markers');
}

/**
 * ========================================
 * UTILITY: Get Posting Statistics
 * ========================================
 * Shows how many posts are ready, posted, or have errors
 */
function getPostingStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const postsSheet = ss.getSheetByName("Post Components");
  const lastRow = postsSheet.getLastRow();
  
  let readyToPost = 0;
  let alreadyPosted = 0;
  let errors = 0;
  let missingData = 0;
  
  for (let i = 2; i <= lastRow; i++) {
    const caption = postsSheet.getRange(i, 1).getValue();
    const imageUrl = postsSheet.getRange(i, 3).getValue();
    const status = postsSheet.getRange(i, 4).getValue();
    
    if (!caption || !imageUrl) {
      missingData++;
    } else if (status === "✓ Posted") {
      alreadyPosted++;
    } else if (status && status.toString().includes("Error")) {
      errors++;
    } else {
      readyToPost++;
    }
  }
  
  Logger.log('=== POSTING STATISTICS ===');
  Logger.log('Ready to post: ' + readyToPost);
  Logger.log('Already posted: ' + alreadyPosted);
  Logger.log('Errors: ' + errors);
  Logger.log('Missing data: ' + missingData);
  Logger.log('Total rows: ' + (lastRow - 1));
}
