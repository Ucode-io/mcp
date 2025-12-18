import { mapTableToCreateTableArgs } from "../mappers/createTable.mapper.js";

export async function executeCreateTables({ uiSpec, context, callTool }) {
  const executed = [];

  for (const table of uiSpec.tables) {
    const args = mapTableToCreateTableArgs(table, context);

    try {
      await callTool("create_table", args);

      executed.push({
        tool: "create_table",
        slug: table.slug,
        status: "success",
      });
    } catch (err) {
      throw new Error(`Failed to create table "${table.slug}": ${err.message}`);
    }
  }

  return executed;
}
