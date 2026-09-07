/**
 * Function to get a list of items (rows) from a Ucode table.
 *
 * Mirrors what the admin panel does: GET /v2/items/{collection}?data=<url-encoded JSON>.
 * All filters, paging and ordering travel inside that single `data` JSON param —
 * flat query params are ignored by the gateway.
 *
 * @param {Object} args - Arguments for listing items.
 * @param {string} args.table_slug - The slug of the table to read from.
 * @param {number} [args.limit=20] - Page size (clamped to MAX_LIMIT).
 * @param {number} [args.offset=0] - Rows to skip.
 * @param {string} [args.search] - Search value, applied to fields marked as searchable.
 * @param {Object} [args.order] - Ordering, e.g. { created_at: "desc" }.
 * @param {Object} [args.filters] - Field filters keyed by field slug.
 * @param {boolean} [args.with_relations=false] - Attach related rows as `<field>_data`.
 * @param {string} args.x_api_key - The X-API-KEY (injected by the MCP server).
 * @returns {Promise<Object>} - { count, response: [...] } or an error object.
 */

// Keep responses small enough for an LLM context and avoid unbounded scans on big tables.
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

// Reserved keys of the `data` payload — a filter may not shadow them.
const RESERVED_KEYS = new Set(['limit', 'offset', 'order', 'search', 'with_relations', 'with_types']);

/**
 * Normalize ordering into what the object-builder expects: 1 = ASC, -1 = DESC.
 * Accepts { field: "asc" | "desc" | 1 | -1 }.
 */
const normalizeOrder = (order) => {
    if (!order || typeof order !== 'object' || Array.isArray(order)) return null;

    const normalized = {};
    for (const [field, direction] of Object.entries(order)) {
        if (typeof direction === 'number') {
            normalized[field] = direction < 0 ? -1 : 1;
            continue;
        }
        normalized[field] = String(direction).toLowerCase() === 'desc' ? -1 : 1;
    }

    return Object.keys(normalized).length > 0 ? normalized : null;
};

const executeFunction = async ({
    table_slug,
    limit,
    offset,
    search,
    order,
    filters,
    with_relations = false,
    x_api_key
}) => {
    const baseUrl = process.env.BASE_URL || 'https://api.admin.u-code.io';
    const auth_method = 'API-KEY';

    if (!x_api_key) return { error: "Missing required x_api_key." };
    if (!table_slug) return { error: "Missing required table_slug." };

    // Filters go in as plain top-level keys, so drop anything that would shadow a reserved key.
    const dataParam = {};
    if (filters && typeof filters === 'object' && !Array.isArray(filters)) {
        for (const [key, value] of Object.entries(filters)) {
            if (RESERVED_KEYS.has(key)) continue;
            if (value === null || value === undefined) continue;
            dataParam[key] = value;
        }
    }

    const parsedLimit = Number(limit);
    dataParam.limit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(Math.trunc(parsedLimit), MAX_LIMIT)
        : DEFAULT_LIMIT;

    const parsedOffset = Number(offset);
    dataParam.offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? Math.trunc(parsedOffset) : 0;

    if (typeof search === 'string' && search.trim() !== '') dataParam.search = search.trim();

    const normalizedOrder = normalizeOrder(order);
    if (normalizedOrder) dataParam.order = normalizedOrder;

    if (with_relations === true) dataParam.with_relations = true;

    try {
        // Same encoding the admin panel uses: one encodeURIComponent over the JSON.
        const url = `${baseUrl}/v2/items/${encodeURIComponent(table_slug)}?data=${encodeURIComponent(JSON.stringify(dataParam))}`;

        console.log(`[MCP] get_table_items calling: ${baseUrl}/v2/items/${table_slug}`);
        console.log(`[MCP] get_table_items data:`, JSON.stringify(dataParam));

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': auth_method,
                'Content-Type': 'application/json',
                'X-API-KEY': x_api_key
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[MCP] get_table_items error response:`, errorText);
            return {
                error: "Ucode API returned a non-2xx response while getting table items",
                status: response.status,
                body: errorText,
                sentData: dataParam
            };
        }

        const result = await response.json();

        // The gateway wraps the payload in { data: { count, response } }; surface it flat
        // so the model gets the rows without digging, but keep the raw body as a fallback.
        const payload = result?.data ?? result;
        if (payload && typeof payload === 'object' && Array.isArray(payload.response)) {
            return {
                count: payload.count ?? payload.response.length,
                limit: dataParam.limit,
                offset: dataParam.offset,
                response: payload.response
            };
        }

        return result;
    } catch (error) {
        console.error('Error getting table items:', error);
        return { error: 'An error occurred while getting table items.', details: String(error?.message || error) };
    }
};

/**
 * Tool configuration for listing items of a Ucode table.
 * @type {Object}
 */
const apiTool = {
    function: executeFunction,
    definition: {
        type: 'function',
        function: {
            name: 'get_table_items',
            description: 'Read rows (records) from a Ucode table. Use it to inspect existing data, verify records created with create_table_item, or fetch rows before updating them. Returns { count, response: [...] } where count is the total number of matching rows and response holds the current page. Default page size is 20, maximum 100.',
            parameters: {
                type: 'object',
                properties: {
                    table_slug: {
                        type: 'string',
                        description: 'The slug of the table to read from (e.g. "customers", "orders"). Use the exact slug from create_table or get_dbml.'
                    },
                    limit: {
                        type: 'number',
                        description: 'Number of rows to return. Defaults to 20, capped at 100.'
                    },
                    offset: {
                        type: 'number',
                        description: 'Number of rows to skip, for paging. Defaults to 0.'
                    },
                    search: {
                        type: 'string',
                        description: 'Free-text search value. Only applies to text fields that are marked as searchable in the table settings.'
                    },
                    order: {
                        type: 'object',
                        description: 'Sorting by field slug, e.g. {"created_at": "desc", "name": "asc"}. Accepts "asc"/"desc" or 1/-1.',
                        additionalProperties: true
                    },
                    filters: {
                        type: 'object',
                        description: 'Filters keyed by field slug. A plain value matches that field ("_id"/guid fields match exactly, text fields match case-insensitively as a substring). For ranges use an operator object, e.g. {"amount": {"$gte": 100, "$lt": 500}} or {"status": {"$in": ["new", "paid"]}}. Supported operators: $gt, $gte, $lt, $lte, $in.',
                        additionalProperties: true
                    },
                    with_relations: {
                        type: 'boolean',
                        description: 'When true, each row also includes the related record of every Many2One relation as "<field_slug>_data". Makes the response noticeably larger.'
                    }
                },
                required: ['table_slug']
            }
        }
    }
};

export { apiTool };
