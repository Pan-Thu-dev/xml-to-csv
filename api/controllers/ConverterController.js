const fs = require("fs");
const path = require("path");
const xml2js = require("xml2js");
const { Parser } = require("json2csv");

/**
 * Utility function to clean up and flatten the parsed JSON.
 */
const cleanJson = (obj) => {
  if (Array.isArray(obj)) {
    return obj.length === 1 ? cleanJson(obj[0]) : obj.map(cleanJson);
  } else if (typeof obj === "object" && obj !== null) {
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
      if (key === "$") {
        continue;
      }
      cleaned[key] = cleanJson(value);
    }
    return cleaned;
  } else {
    return obj;
  }
};

/**
 * Ensure that a directory exists, or create it.
 */
const ensureDirectory = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

/**
 * Utility function to flatten nested JSON objects.
 */
const flattenJson = (data, parentKey = "", result = {}) => {
  for (let [key, value] of Object.entries(data)) {
    const newKey = parentKey ? `${parentKey}/${key}` : key;
    if (typeof value === "object" && !Array.isArray(value) && value !== null) {
      flattenJson(value, newKey, result);
    } else {
      result[newKey] = value;
    }
  }
  return result;
};

/**
 * Convert XML fles from uploads directory to CSV files and save it in exports directory
 * Endpoint: POST /convert/xml-to-csv
 */
module.exports = {
  async convert(req, res) {
    const { filename, jsonPath = "clearing.operation" } = req.body;

    if (!filename) {
      return res.badRequest({ error: "Filename is required." });
    }

    const uploadsDir = path.join(__dirname, "../../uploads");
    const exportsDir = path.join(__dirname, "../../exports");
    const xmlFilePath = path.join(uploadsDir, filename);
    const outputCsvPath = path.join(
      exportsDir,
      `${path.basename(filename, path.extname(filename))}.csv`
    );

    ensureDirectory(uploadsDir);
    ensureDirectory(exportsDir);

    if (!fs.existsSync(xmlFilePath)) {
      return res.notFound({ error: "File not found in XML directory." });
    }

    try {
      // Convert XML to JSON
      const xmlData = fs.readFileSync(xmlFilePath, "utf8");
      const parser = new xml2js.Parser();
      const rawJson = await parser.parseStringPromise(xmlData);
      const cleanedJson = cleanJson(rawJson);

      let response = {
        message: "XML successfully converted to JSON.",
        data: cleanedJson,
      };

      // Convert JSON to CSV
      const dataToConvert = jsonPath
        .split(".")
        .reduce((acc, key) => (acc && acc[key] ? acc[key] : null), cleanedJson);

      if (!dataToConvert) {
        return res.badRequest({
          error: `The specified JSON path '${jsonPath}' does not exist.`,
        });
      }

      if (!Array.isArray(dataToConvert)) {
        return res.badRequest({
          error:
            "The selected JSON data is not an array and cannot be converted to CSV.",
        });
      }

      const flattenedData = dataToConvert.map((item) => flattenJson(item));

      const json2csvParser = new Parser();
      const csv = json2csvParser.parse(flattenedData);
      fs.writeFileSync(outputCsvPath, csv, "utf8");

      response.message = "XML successfully converted to JSON and CSV.";
      response.csvFilePath = outputCsvPath;

      return res.json(response);
    } catch (error) {
      console.error("Error during conversion:", error);
      return res.serverError({
        error: "Failed to convert XML to JSON/CSV.",
        details: error.message,
      });
    }
  },
};
