/**
 * Function to get table details from Ucode API.
 *
 * @param {Object} args - Arguments for getting table details.
 * @param {string} args.collection - The table slug.
 * @param {string} args.x_api_key - The X-API-KEY.
 * @returns {Promise<Object>} - The table details.
 */
const executeFunction = async ({
    collection,
    x_api_key
}) => {
    const baseUrl = process.env.BASE_URL || 'https://admin-api.ucode.run';
    const auth_method = 'API-KEY';

    if (!x_api_key) return { error: "Missing required x_api_key." };
    if (!collection) return { error: "Missing required collection (table slug)." };

    try {
        const url = `${baseUrl}/v1/table-details/${collection}`;

        console.log(`[MCP] get_table_details calling: ${url}`);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': auth_method,
                'Content-Type': 'application/json',
                'X-API-KEY': x_api_key
            },
            body: JSON.stringify({ data: {} })
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                error: "Ucode API returned a non-2xx response while fetching table details",
                status: response.status,
                body: errorText,
            };
        }

        const data = await response.json();
        return data; 
    } catch (error) {
        console.error('Error getting table details:', error);
        return { error: 'An error occurred while getting table details.', details: String(error?.message || error) };
    }
};

/**
 * Tool configuration for getting table details.
 * @type {Object}
 */
const apiTool = {
    function: executeFunction,
    definition: {
        type: 'function',
        function: {
            name: 'get_table_details',
            description: 'Retrieve details for a specific table (collection) using its slug.',
            parameters: {
                type: 'object',
                properties: {
                    collection: { type: 'string', description: 'The slug of the table (e.g., the part after table-details/ in the URL).' },
                    x_api_key: { type: 'string', description: 'The X-API-KEY for authentication.' }
                },
                required: ['collection', 'x_api_key']
            }
        }
    }
};

export { apiTool };
