import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join, basename, extname } from "path";
import { Parser as _Parser } from "xml2js";
import { Parser } from "json2csv";

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
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
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

export /**
 * Convert XML file to JSON and save it in the exports directory
 * Endpoint: POST /convert/xml-to-json
 */
async function xmlToJson(req, res) {
  const { filename } = req.body;

  if (!filename) {
    return res.badRequest({ error: "Filename is required." });
  }

  const xmlDir = join(__dirname, "../../templates/xml");
  const jsonDir = join(__dirname, "../../templates/json");
  const xmlFilePath = join(xmlDir, filename);
  const outputJsonPath = join(
    jsonDir,
    `${basename(filename, extname(filename))}.json`
  );

  ensureDirectory(xmlDir);
  ensureDirectory(jsonDir);

  if (!existsSync(xmlFilePath)) {
    return res.notFound({ error: "File not found in uploads directory." });
  }

  try {
    const xmlData = readFileSync(xmlFilePath, "utf8");
    const parser = new _Parser();
    const rawJson = await parser.parseStringPromise(xmlData);

    const cleanedJson = cleanJson(rawJson);

    writeFileSync(outputJsonPath, JSON.stringify(cleanedJson, null, 2), "utf8");

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
}
export /**
 * Convert JSON file to CSV and save it in the exports directory
 * Endpoint: POST /convert/json-to-csv
 */
async function jsonToCsv(req, res) {
  const { filename, jsonPath } = req.body;

  if (!filename) {
    return res.badRequest({ error: "Filename is required." });
  }

  const jsonFilePath = join(__dirname, "../../templates/json", filename);
  const outputCsvPath = join(
    __dirname,
    "../../templates/csv",
    `${basename(filename, extname(filename))}.csv`
  );

  if (!existsSync(jsonFilePath)) {
    return res.notFound({
      error: "JSON file not found in exports directory.",
    });
  }

  try {
    const jsonData = JSON.parse(readFileSync(jsonFilePath, "utf8"));

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

    writeFileSync(outputCsvPath, csv, "utf8");

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
}
