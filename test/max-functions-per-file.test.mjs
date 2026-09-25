import assert from "node:assert/strict";
import { test } from "node:test";
import maxFunctionsPerFile from "../scripts/max-functions-per-file.js";

test("reports once when function definitions exceed the per-file limit", () => {
  const reports = [];
  const visitors = maxFunctionsPerFile.create({
    options: [{ max: 2 }],
    report: (report) => reports.push(report),
  });

  visitors.FunctionDeclaration({});
  visitors.ArrowFunctionExpression({});
  visitors.FunctionExpression({});
  visitors.FunctionExpression({});

  assert.equal(reports.length, 1);
  assert.equal(reports[0].messageId, "tooMany");
});
