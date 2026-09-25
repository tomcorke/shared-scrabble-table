export default {
  meta: {
    type: "suggestion",
    docs: { description: "limit function definitions per file" },
    schema: [
      {
        type: "object",
        properties: { max: { type: "integer", minimum: 1 } },
        additionalProperties: false,
      },
    ],
    messages: {
      tooMany: "File exceeds the limit of {{max}} function definitions.",
    },
  },
  create(context) {
    const max = context.options[0]?.max ?? 20;
    let count = 0;
    let reported = false;

    function countFunction(node) {
      if (++count > max && !reported) {
        reported = true;
        context.report({ node, messageId: "tooMany", data: { max } });
      }
    }

    return {
      FunctionDeclaration: countFunction,
      FunctionExpression: countFunction,
      ArrowFunctionExpression: countFunction,
    };
  },
};
