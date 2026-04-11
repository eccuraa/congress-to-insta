// ============================================================
// imgUrlCreation.gs — Generates images and uploads to ImgBB
// Depends on: 0_Config.gs (CONFIG, SHEET_NAMES, SCRAPED_COL, POST_COL)
// ============================================================

// ============================================================
// CLASS: SheetReader
// Reads row data from Scraped Data and Post Components sheets
// ============================================================
class SheetReader {
  constructor() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    this.scrapedSheet = ss.getSheetByName(SHEET_NAMES.scrapedData);
    this.postsSheet = ss.getSheetByName(SHEET_NAMES.postComponents);
  }

  getLastRow() {
    return this.scrapedSheet.getLastRow();
  }

  getLawName(row) {
    return this.scrapedSheet.getRange(row, SCRAPED_COL.lawName).getValue().toString().trim();
  }

  getVisualSummary(row) {
    return this.postsSheet.getRange(row, POST_COL.visualSummary).getValue().toString().trim();
  }

  getSweepValues(row) {
    return {
      senate_ind_value: this.postsSheet.getRange(row, POST_COL.pctSenateInd).getValue(),
      house_ind_value:  this.postsSheet.getRange(row, POST_COL.pctHouseInd).getValue(),
      senate_dem_value: this.postsSheet.getRange(row, POST_COL.pctSenateDem).getValue(),
      house_dem_value:  this.postsSheet.getRange(row, POST_COL.pctHouseDem).getValue(),
      senate_rep_value: this.postsSheet.getRange(row, POST_COL.pctSenateRep).getValue(),
      house_rep_value:  this.postsSheet.getRange(row, POST_COL.pctHouseRep).getValue(),
    };
  }

  setImageUrl(row, url) {
    this.postsSheet.getRange(row, POST_COL.imageUrl).setValue(url);
  }

  resolveTextForRow(row) {
    const lawName = this.getLawName(row);
    const visualSummary = this.getVisualSummary(row);
    return !visualSummary || visualSummary.toLowerCase() === "no summary available"
      ? lawName
      : visualSummary;
  }
}

// ============================================================
// CLASS: SweepValueValidator
// Validates that all required percentage inputs are present
// ============================================================
class SweepValueValidator {
  constructor() {
    this._columnLabels = {
      senate_ind_value: `% of Senate Ind Yeas (col ${POST_COL.pctSenateInd})`,
      house_ind_value:  `% of House Ind Yeas (col ${POST_COL.pctHouseInd})`,
      senate_dem_value: `% of Senate Dem Yeas (col ${POST_COL.pctSenateDem})`,
      house_dem_value:  `% of House Dem Yeas (col ${POST_COL.pctHouseDem})`,
      senate_rep_value: `% of Senate Rep Yeas (col ${POST_COL.pctSenateRep})`,
      house_rep_value:  `% of House Rep Yeas (col ${POST_COL.pctHouseRep})`,
    };
  }

  _isMissing(val) {
    return val === "" || val === null || val === undefined || isNaN(Number(val));
  }

  validate(sweepValues, row) {
    const missing = Object.entries(this._columnLabels)
      .filter(([key]) => this._isMissing(sweepValues[key]))
      .map(([, label]) => `  • ${label}`);

    if (missing.length > 0) {
      throw new Error(
        `Row ${row} is missing required percentage data for the Cloud Function.\n` +
        `Please fill in the following columns in "${SHEET_NAMES.postComponents}" before running:\n` +
        missing.join("\n")
      );
    }
  }
}

// ============================================================
// CLASS: ArcPlotClient
// Calls the Python Cloud Function to generate arc plot images
// ============================================================
class ArcPlotClient {
  constructor(cloudFunctionUrl) {
    this.cloudFunctionUrl = cloudFunctionUrl;
  }

  generate(sweepValues) {
    const response = UrlFetchApp.fetch(this.cloudFunctionUrl, {
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
}

// ============================================================
// CLASS: SlideGenerator
// Creates a Google Slide from a template, fills it, exports PNG
// ============================================================
class SlideGenerator {
  constructor(templateId) {
    this.templateId = templateId;
  }

  create(text, arcImageUrl) {
    const copy = DriveApp.getFileById(this.templateId).makeCopy("Temp_Slide_" + Date.now());
    const slideId = copy.getId();
    const presentation = SlidesApp.openById(slideId);
    const slides = presentation.getSlides();

    if (slides.length === 0) throw new Error("Template has no slides");

    const firstSlide = slides[0];
    firstSlide.replaceAllText("[text]", text);
    firstSlide
      .insertImage(arcImageUrl)
      .setLeft(155)
      .setTop(350)
      .setWidth(400)
      .setHeight(400);

    presentation.saveAndClose();
    return slideId;
  }

  exportAsPng(slideId, slideIndex = 0) {
    const presentation = SlidesApp.openById(slideId);
    const slides = presentation.getSlides();

    if (slideIndex >= slides.length) {
      throw new Error(`Slide index ${slideIndex} out of range`);
    }

    const slideObjectId = slides[slideIndex].getObjectId();
    const exportUrl = `https://docs.google.com/presentation/d/${slideId}/export/png?id=${slideId}&pageid=${slideObjectId}`;

    const response = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true,
    });

    if (response.getResponseCode() !== 200) {
      throw new Error("Failed to export slide. Response: " + response.getResponseCode());
    }

    return response.getBlob().setName("slide.png");
  }

  trash(slideId) {
    DriveApp.getFileById(slideId).setTrashed(true);
  }
}

// ============================================================
// CLASS: ImgBBUploader
// Uploads a PNG blob to ImgBB and returns the hosted URL
// ============================================================
class ImgBBUploader {
  constructor(apiKey) {
    if (!apiKey) throw new Error("ImgBB API key not configured in 0_Config.gs");
    this.apiKey = apiKey;
    this._uploadUrl = "https://api.imgbb.com/1/upload";
  }

  upload(imageBlob) {
    const response = UrlFetchApp.fetch(this._uploadUrl, {
      method: "post",
      payload: {
        key: this.apiKey,
        image: Utilities.base64Encode(imageBlob.getBytes()),
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
}

// ============================================================
// CLASS: ImagePipeline
// Orchestrates the full row-by-row image generation pipeline
// ============================================================
class ImagePipeline {
  constructor() {
    this.sheetReader = new SheetReader();
    this.validator = new SweepValueValidator();
    this.arcClient = new ArcPlotClient(CONFIG.cloudFunctionUrl);
    this.slideGenerator = new SlideGenerator(CONFIG.templateId);
    this.uploader = new ImgBBUploader(CONFIG.imgbbApiKey);
  }

  _processRow(row) {
    const lawName = this.sheetReader.getLawName(row);
    if (!lawName || lawName.toLowerCase() === "no laws found") return;

    const textToUse = this.sheetReader.resolveTextForRow(row);
    const sweepValues = this.sheetReader.getSweepValues(row);

    Logger.log(`Processing row ${row}: "${textToUse}"`);

    this.validator.validate(sweepValues, row);

    const arcImageUrl = this.arcClient.generate(sweepValues);
    const slideId = this.slideGenerator.create(textToUse, arcImageUrl);

    try {
      const imageBlob = this.slideGenerator.exportAsPng(slideId);
      const imageUrl = this.uploader.upload(imageBlob);
      this.sheetReader.setImageUrl(row, imageUrl);
      Logger.log(`Row ${row} complete: ${imageUrl}`);
    } finally {
      // Always clean up the temp slide even if upload fails
      this.slideGenerator.trash(slideId);
    }
  }

  run() {
    const lastRow = this.sheetReader.getLastRow();

    for (let i = 2; i <= lastRow; i++) {
      try {
        this._processRow(i);
      } catch (error) {
        Logger.log(`ERROR on row ${i}: ${error.toString()}`);
      }
    }
  }
}

// ============================================================
// ENTRY POINT
// ============================================================
function generateAllImgBBUrls() {
  new ImagePipeline().run();
}
