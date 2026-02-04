/**
 * Function to create an item (row) in a Ucode table.
 *
 * @param {Object} args - Arguments for creating the table item.
 * @param {string} args.table_slug - The slug of the table where the item will be created.
 * @param {Object} args.data - The field data for the new item (field names and values).
 * @param {string} args.x_api_key - The X-API-KEY for authentication.
 * @returns {Promise<Object>} - The result of the item creation.
 */
const executeFunction = async ({
    table_slug,
    data,
    x_api_key
}) => {
    const baseUrl = process.env.BASE_URL || 'https://admin-api.ucode.run';
    const auth_method = 'API-KEY';

    if (!x_api_key) return { error: "Missing required x_api_key." };
    if (!table_slug) return { error: "Missing required table_slug." };
    if (!data || typeof data !== 'object') return { error: "Missing or invalid data. Data must be an object with field names and values." };

    try {
        const url = `${baseUrl}/v2/items/${table_slug}`;

        console.log(`[MCP] create_table_item calling: ${url}`);

        const requestBody = {
            data: data
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': auth_method,
                'Content-Type': 'application/json',
                'x-api-key': x_api_key
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                error: "Ucode API returned a non-2xx response while creating table item",
                status: response.status,
                body: errorText,
            };
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Error creating table item:', error);
        return { error: 'An error occurred while creating the table item.', details: String(error?.message || error) };
    }
};

/**
 * Tool configuration for creating a table item.
 * @type {Object}
 */
const apiTool = {
    function: executeFunction,
    definition: {
        type: 'function',
        function: {
            name: 'create_table_item',
            description: 'CRITICAL: Create a new row/record in a Ucode table. This tool MUST be called after tables and fields are created to populate them with test data. Each table should have at least 3 test records.',
            parameters: {
                type: 'object',
                properties: {
                    table_slug: {
                        type: 'string',
                        description: 'The slug of the table where the item will be created. Use the exact slug from create_table response (e.g., "customers", "products", "orders").'
                    },
                    data: {
                        type: 'object',
                        description: 'An object with field slugs as keys and their values. Use field slugs from update_table, not labels. Example: {"name": "John Doe", "email": "john@example.com", "status": "active", "amount": 1500}'
                    },
                    x_api_key: {
                        type: 'string',
                        description: 'The X-API-KEY for authentication (same key used for create_table and update_table).'
                    }
                },
                required: ['table_slug', 'data', 'x_api_key']
            }
        }
    }
};

export { apiTool };
