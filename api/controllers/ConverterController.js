const fs = require("fs");
const path = require("path");
const xml2js = require("xml2js");
const { Parser } = require("json2csv");

/**
 * Utility function to clean up and flatten the parsed JSON.
 * - Removes unnecessary arrays for single-value fields.
 * - Simplifies structures by removing metadata like `$` or `xmlns`.
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
 * Each nested key is concatenated with its parent key using `/` as a separator.
 */
const flattenJson = (data, parentKey = "", result = {}) => {
  for (let [key, value] of Object.entries(data)) {
    const newKey = parentKey ? `${parentKey}/${key}` : key; // Concatenate parent key
    if (typeof value === "object" && !Array.isArray(value) && value !== null) {
      flattenJson(value, newKey, result); // Recurse for nested objects
    } else {
      result[newKey] = value; // Add key-value pair to result
    }
  }
  return result;
};

module.exports = {
  /**
   * Convert XML file to JSON and save it in the exports directory
   * Endpoint: POST /convert/xml-to-json
   */
  async xmlToJson(req, res) {
    const { filename } = req.body;

    if (!filename) {
      return res.badRequest({ error: "Filename is required." });
    }

    const xmlDir = path.join(__dirname, "../../templates/xml");
    const jsonDir = path.join(__dirname, "../../templates/json");
    const xmlFilePath = path.join(xmlDir, filename);
    const outputJsonPath = path.join(
      jsonDir,
      `${path.basename(filename, path.extname(filename))}.json`
    );

    ensureDirectory(xmlDir);
    ensureDirectory(jsonDir);

    if (!fs.existsSync(xmlFilePath)) {
      return res.notFound({ error: "File not found in uploads directory." });
    }

    try {
      const xmlData = fs.readFileSync(xmlFilePath, "utf8");
      const parser = new xml2js.Parser();
      const rawJson = await parser.parseStringPromise(xmlData);

      const cleanedJson = cleanJson(rawJson);

      fs.writeFileSync(
        outputJsonPath,
        JSON.stringify(cleanedJson, null, 2),
        "utf8"
      );

      return res.json({
        message: "XML successfully converted to JSON and saved.",
        jsonFilePath: outputJsonPath,
        data: cleanedJson,
      });
    } catch (error) {
      console.error("Error during XML to JSON conversion:", error);
      return res.serverError({
        error: "Failed to convert XML to JSON.",
        details: error.message,
      });
    }
  },

  /**
   * Convert JSON file to CSV and save it in the exports directory
   * Endpoint: POST /convert/json-to-csv
   */
  async jsonToCsv(req, res) {
    const { filename, jsonPath } = req.body;

    if (!filename) {
      return res.badRequest({ error: "Filename is required." });
    }

    const jsonFilePath = path.join(__dirname, "../../templates/json", filename);
    const outputCsvPath = path.join(
      __dirname,
      "../../templates/csv",
      `${path.basename(filename, path.extname(filename))}.csv`
    );

    if (!fs.existsSync(jsonFilePath)) {
      return res.notFound({
        error: "JSON file not found in exports directory.",
      });
    }

    try {
      const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, "utf8"));

      // Extract the requested part of the JSON or use the entire file
      const dataToConvert = jsonPath
        ? jsonPath
            .split(".")
            .reduce((acc, key) => (acc && acc[key] ? acc[key] : null), jsonData)
        : jsonData;

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

      return res.json({
        message: "JSON successfully converted to CSV and saved.",
        csvFilePath: outputCsvPath,
      });
    } catch (error) {
      console.error("Error during JSON to CSV conversion:", error);
      return res.serverError({
        error: "Failed to convert JSON to CSV.",
        details: error.message,
      });
    }
  },
};
