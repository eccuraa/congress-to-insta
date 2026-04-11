// ============================================================
// imgUrlCreation.gs — Generates images and uploads to ImgBB
// Depends on: 0_Config.gs
// ============================================================

function generateAllImgBBUrls() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scrapedSheet = ss.getSheetByName(SHEET_NAMES.scrapedData);
  const postsSheet = ss.getSheetByName(SHEET_NAMES.postComponents);
  const lastRow = scrapedSheet.getLastRow();

  for (let i = 2; i <= lastRow; i++) {
    const lawName = scrapedSheet.getRange(i, SCRAPED_COL.lawName).getValue().toString().trim();
    if (!lawName || lawName.toLowerCase() === "no laws found") continue;

    const visualSummary = postsSheet.getRange(i, POST_COL.visualSummary).getValue().toString().trim();
    const textToUse =
      !visualSummary || visualSummary.toLowerCase() === "no summary available"
        ? lawName
        : visualSummary;

    const sweepValues = {
      senate_ind_value: postsSheet.getRange(i, POST_COL.pctSenateInd).getValue(),
      house_ind_value:  postsSheet.getRange(i, POST_COL.pctHouseInd).getValue(),
      senate_dem_value: postsSheet.getRange(i, POST_COL.pctSenateDem).getValue(),
      house_dem_value:  postsSheet.getRange(i, POST_COL.pctHouseDem).getValue(),
      senate_rep_value: postsSheet.getRange(i, POST_COL.pctSenateRep).getValue(),
      house_rep_value:  postsSheet.getRange(i, POST_COL.pctHouseRep).getValue(),
    };

    try {
      Logger.log(`Processing row ${i}: "${textToUse}"`);

      validateSweepValues(sweepValues, i);

      const arcImageUrl = callPythonPlotter(sweepValues);
      const slideId = createSlideWithText(textToUse, arcImageUrl);
      const imageBlob = exportSlideAsImage(slideId, 0);
      const imageUrl = uploadToImgBB(imageBlob);

      postsSheet.getRange(i, POST_COL.imageUrl).setValue(imageUrl);
      DriveApp.getFileById(slideId).setTrashed(true);
      Logger.log(`Row ${i} complete: ${imageUrl}`);
    } catch (error) {
      Logger.log(`ERROR on row ${i}: ${error.toString()}`);
    }
  }
}

/**
 * Calls Cloud Function with sweep values, returns arc plot image URL
 */
function callPythonPlotter(sweepValues) {
  const response = UrlFetchApp.fetch(CONFIG.cloudFunctionUrl, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(sweepValues),
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    throw new Error(`Cloud Function failed: ${response.getContentText()}`);
  }

  return JSON.parse(response.getContentText()).imageUrl;
}

/**
 * Create slide from template, insert arc image, replace text placeholder
 */
function createSlideWithText(sheetText, arcImageUrl) {
  const templateFile = DriveApp.getFileById(CONFIG.templateId);
  const copy = templateFile.makeCopy("Temp_Slide_" + Date.now());
  const slideId = copy.getId();

  const presentation = SlidesApp.openById(slideId);
  const slides = presentation.getSlides();

  if (slides.length === 0) throw new Error("Template has no slides");

  const firstSlide = slides[0];
  firstSlide.replaceAllText("[text]", sheetText);

  firstSlide
    .insertImage(arcImageUrl)
    .setLeft(155)
    .setTop(350)
    .setWidth(400)
    .setHeight(400);

  presentation.saveAndClose();
  return slideId;
}

/**
 * Export slide as PNG
 */
function exportSlideAsImage(presentationId, slideIndex) {
  const presentation = SlidesApp.openById(presentationId);
  const slides = presentation.getSlides();

  if (slideIndex >= slides.length) {
    throw new Error(`Slide index ${slideIndex} out of range`);
  }

  const slide = slides[slideIndex];
  const slideObjectId = slide.getObjectId();
  const exportUrl = `https://docs.google.com/presentation/d/${presentationId}/export/png?id=${presentationId}&pageid=${slideObjectId}`;

  const response = UrlFetchApp.fetch(exportUrl, {
    headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    throw new Error("Failed to export slide. Response: " + response.getResponseCode());
  }

  return response.getBlob().setName("slide.png");
}

/**
 * Upload PNG to ImgBB
 */
function uploadToImgBB(imageBlob) {
  if (!CONFIG.imgbbApiKey) {
    throw new Error("ImgBB API key not configured in 0_Config.gs");
  }

  const base64Image = Utilities.base64Encode(imageBlob.getBytes());
  const response = UrlFetchApp.fetch("https://api.imgbb.com/1/upload", {
    method: "post",
    payload: {
      key: CONFIG.imgbbApiKey,
      image: base64Image,
      name: "slide-" + Date.now(),
    },
    muteHttpExceptions: true,
  });

  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (responseCode !== 200) {
    throw new Error(`ImgBB upload failed. Status: ${responseCode}, Response: ${responseText}`);
  }

  const data = JSON.parse(responseText);
  if (!data.success) throw new Error("ImgBB returned success=false: " + responseText);

  return data.data.url;
}

/**
 * Validate sweep values before calling Cloud Function
 */
function validateSweepValues(sweepValues, row) {
  const columnLabels = {
    senate_ind_value: `% of Senate Ind Yeas (col ${POST_COL.pctSenateInd})`,
    house_ind_value:  `% of House Ind Yeas (col ${POST_COL.pctHouseInd})`,
    senate_dem_value: `% of Senate Dem Yeas (col ${POST_COL.pctSenateDem})`,
    house_dem_value:  `% of House Dem Yeas (col ${POST_COL.pctHouseDem})`,
    senate_rep_value: `% of Senate Rep Yeas (col ${POST_COL.pctSenateRep})`,
    house_rep_value:  `% of House Rep Yeas (col ${POST_COL.pctHouseRep})`,
  };

  const missing = [];
  for (const [key, label] of Object.entries(columnLabels)) {
    const val = sweepValues[key];
    if (val === "" || val === null || val === undefined || isNaN(Number(val))) {
      missing.push(label);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Row ${row} is missing required percentage data for the Cloud Function.\n` +
      `Please fill in the following columns in "${SHEET_NAMES.postComponents}" before running:\n` +
      missing.map((col) => `  • ${col}`).join("\n")
    );
  }
}
