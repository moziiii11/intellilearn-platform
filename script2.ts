import fs from "fs";

let text = fs.readFileSync("server.ts", "utf-8");

text = text.replace('import { GoogleGenAI } from "@google/genai";', 'import OpenAI from "openai";');

// Revert configuration
text = text.replace(/const geminiClient = new GoogleGenAI\(\{ apiKey: process\.env\.GEMINI_API_KEY \|\| "dummy" \}\);(.*?)function toGeminiFormat/s,
`// 移除 baseURL 末尾的 /chat/completions，防止由 OpenAI SDK 自动拼接而导致 404
let sparkBaseURL = process.env.SPARK_BASE_URL || "https://spark-api-open.xf-yun.com/v1";
if (sparkBaseURL.endsWith('/chat/completions')) {
  sparkBaseURL = sparkBaseURL.replace(/\\/chat\\/completions$/, '');
}

// ============= 多模型配置 =============
// Pro 模型客户端 — 用于画像分析、智能问答、导师辅导、路径规划
const proClient = new OpenAI({
  apiKey: process.env.SPARK_API_KEY || "dummy",
  baseURL: sparkBaseURL,
});
const proModel = process.env.SPARK_MODEL || "pro-128k";

// Ultra 32k 模型客户端 — 用于学习资源生成（文档/思维导图/习题/代码）
// 如果配置了独立的 Ultra API Key 则使用，否则复用 Pro 的 Key
const ultraClient = new OpenAI({
  apiKey: process.env.SPARK_ULTRA_API_KEY || process.env.SPARK_API_KEY || "dummy",
  baseURL: process.env.SPARK_ULTRA_BASE_URL || sparkBaseURL,
});
const ultraModel = process.env.SPARK_ULTRA_MODEL || "ultra-32k";

const agentConfigs = {
  profile: { client: proClient, model: proModel },       // 学习数据分析用 Pro
  tutor: { client: proClient, model: proModel },          // 导师辅导用 Pro
  resource: { client: ultraClient, model: ultraModel },   // 学习资源生成用 Ultra 32k
  path: { client: proClient, model: proModel },           // 路径规划用 Pro
};

function toGeminiFormat`);

// Remove function toGeminiFormat
text = text.replace(/function toGeminiFormat[\s\S]*?\}\n\n\/\/ =============/, '// =============');

// Revert API Calls

// 1. Phase 1
text = text.replace(
`    const { contents, systemInstruction } = toGeminiFormat([{ role: 'user', content: analysisPrompt }]);
    const analysisResponse = await agentConfigs.profile.client.models.generateContent({
      model: agentConfigs.profile.model,
      contents,
      config: { systemInstruction, temperature: 0.5, maxOutputTokens: 4096 }
    });

    let analysisContent = analysisResponse.text || '';`,
`    const analysisResponse = await agentConfigs.profile.client.chat.completions.create({
      model: agentConfigs.profile.model,
      messages: [{ role: 'user', content: analysisPrompt }],
      temperature: 0.5,
      max_tokens: 4096,
    });

    let analysisContent = analysisResponse.choices[0]?.message?.content || '';`
);

// 2. Phase 2
text = text.replace(
`    const { contents: rContents, systemInstruction: rSystem } = toGeminiFormat([{ role: 'user', content: resourcePrompt }]);
    const resourceResponse = await agentConfigs.resource.client.models.generateContent({
      model: agentConfigs.resource.model,
      contents: rContents,
      config: { systemInstruction: rSystem, temperature: 0.6, maxOutputTokens: 8192 }
    });

    let resourceContent = resourceResponse.text || '';`,
`    const resourceResponse = await agentConfigs.resource.client.chat.completions.create({
      model: agentConfigs.resource.model,
      messages: [{ role: 'user', content: resourcePrompt }],
      temperature: 0.6,
      max_tokens: 16384,
    });

    let resourceContent = resourceResponse.choices[0]?.message?.content || '';`
);

// 3. Behavioral
text = text.replace(
`    const { contents, systemInstruction } = toGeminiFormat([{ role: "user", content: weakAreasPrompt }]);
    const response = await agentConfigs.profile.client.models.generateContent({
      model: agentConfigs.profile.model,
      contents,
      config: { systemInstruction, temperature: 0.5, maxOutputTokens: 4096 }
    });

    let content = response.text || "";`,
`    const response = await agentConfigs.profile.client.chat.completions.create({
      model: agentConfigs.profile.model,
      messages: [{ role: "user", content: weakAreasPrompt }],
      temperature: 0.5,
      max_tokens: 4096,
    });

    let content = response.choices[0]?.message?.content || "";`
);

// 4. /api/chat
text = text.replace(
`      const { contents, systemInstruction } = toGeminiFormat(sanitizedMessages, systemMsg.content);
      const response = await agentConfigs.profile.client.models.generateContent({
        model: agentConfigs.profile.model,
        contents,
        config: { systemInstruction }
      });

      const assistantResponse = response.text || "";`,
`      const response = await agentConfigs.profile.client.chat.completions.create({
        model: agentConfigs.profile.model,
        messages: [systemMsg, ...sanitizedMessages],
      });

      const assistantResponse = response.choices[0].message.content;`
);

// 5. /api/chat/stream
text = text.replace(
`      const { contents, systemInstruction } = toGeminiFormat(messages, systemMsg.content);
      const stream = await agentConfigs.profile.client.models.generateContentStream({
        model: agentConfigs.profile.model,
        contents,
        config: { systemInstruction }
      });

      let fullResponse = "";
      for await (const chunk of stream) {
        const content = chunk.text;`,
`      const stream = await agentConfigs.profile.client.chat.completions.create({
        model: agentConfigs.profile.model,
        messages: [systemMsg, ...messages],
        stream: true,
      });

      let fullResponse = "";
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;`
);

// 6. /api/tutor
text = text.replace(
`      const { contents, systemInstruction } = toGeminiFormat(sanitizedMessages, systemMsg.content);
      const response = await agentConfigs.tutor.client.models.generateContent({
        model: agentConfigs.tutor.model,
        contents,
        config: { systemInstruction, temperature: 0.7 }
      });

      const assistantResponse = response.text || "";`,
`      const response = await agentConfigs.tutor.client.chat.completions.create({
        model: agentConfigs.tutor.model,
        temperature: 0.7,
        messages: [systemMsg, ...sanitizedMessages],
      });

      const assistantResponse = response.choices[0].message.content;`
);

// 7. /api/tutor/stream
text = text.replace(
`      const { contents, systemInstruction } = toGeminiFormat(messages, systemMsg.content);
      const stream = await agentConfigs.tutor.client.models.generateContentStream({
        model: agentConfigs.tutor.model,
        contents,
        config: { systemInstruction }
      });

      let fullResponse = "";
      for await (const chunk of stream) {
        const content = chunk.text;`,
`      const stream = await agentConfigs.tutor.client.chat.completions.create({
        model: agentConfigs.tutor.model,
        messages: [systemMsg, ...messages],
        stream: true,
      });

      let fullResponse = "";
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content;`
);

// 8. /api/generate-resource
text = text.replace(
`      const { contents, systemInstruction: sysInstr } = toGeminiFormat([{ role: "user", content: \`知识点: \${sanitizeUserContent(topic)}\` }], systemInstruction);
      const response = await agentConfigs.resource.client.models.generateContent({
        model: agentConfigs.resource.model,
        contents,
        config: { systemInstruction: sysInstr, temperature: 0.5, maxOutputTokens: 8192 }
      });

      res.json({ text: response.text || "" });`,
`      const response = await agentConfigs.resource.client.chat.completions.create({
        model: agentConfigs.resource.model,
        temperature: 0.5,
        max_tokens: 16384,
        messages: [{ role: "system", content: systemInstruction }, { role: "user", content: \`知识点: \${sanitizeUserContent(topic)}\` }],
      });

      res.json({ text: response.choices[0].message.content });`
);

// 9. /api/plan-path
text = text.replace(
`      const { contents, systemInstruction } = toGeminiFormat([{ role: "user", content: \`请根据以下学生画像生成个性化学习路径:\\n\${JSON.stringify(userProfile || {}, null, 2)}\` }], PATH_AGENT_PROMPT);
      const response = await agentConfigs.path.client.models.generateContent({
        model: agentConfigs.path.model,
        contents,
        config: { systemInstruction, temperature: 0.5 }
      });
      res.json({ text: response.text || "" });`,
`      const response = await agentConfigs.path.client.chat.completions.create({
        model: agentConfigs.path.model,
        temperature: 0.5,
        messages: [{ role: "system", content: PATH_AGENT_PROMPT }, { role: "user", content: \`请根据以下学生画像生成个性化学习路径:\\n\${JSON.stringify(userProfile || {}, null, 2)}\` }],
      });
      res.json({ text: response.choices[0].message.content });`
);

// 10. /api/generate-title
text = text.replace(
`      const { contents, systemInstruction } = toGeminiFormat([{ role: "user", content: \`为这段话生成一个不超过15个字的简短标题：\\n"\${sanitizeUserContent(content)}"\\n请直接返回标题，不要加其他任何废话和标点符号。\` }]);
      const response = await agentConfigs.profile.client.models.generateContent({
        model: agentConfigs.profile.model,
        contents,
        config: { systemInstruction, temperature: 0.3 }
      });
      res.json({ title: response.text?.trim() || "新对话" });`,
`      const response = await agentConfigs.profile.client.chat.completions.create({
        model: agentConfigs.profile.model,
        messages: [{ role: "user", content: \`为这段话生成一个不超过15个字的简短标题：\\n"\${sanitizeUserContent(content)}"\\n请直接返回标题，不要加其他任何废话和标点符号。\` }],
        temperature: 0.3,
      });
      res.json({ title: response.choices[0].message.content?.trim() || "新对话" });`
);

fs.writeFileSync("server.ts", text);
