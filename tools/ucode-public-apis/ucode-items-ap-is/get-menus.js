/**
 * Function to get menus from Ucode API.
 *
 * @param {Object} args - Arguments for getting menus.
 * @param {string} args.project_id - The project ID.
 * @param {string} args.parent_id - The parent menu ID.
 * @param {string} args.x_api_key - The X-API-KEY.
 * @returns {Promise<Object>} - The list of menus.
 */
const executeFunction = async ({
    project_id,
    parent_id,
    x_api_key
}) => {
    const baseUrl = process.env.BASE_URL || 'https://admin-api.ucode.run';
    const auth_method = 'API-KEY';

    if (!x_api_key) return { error: "Missing required x_api_key." };
    if (!project_id) return { error: "Missing required project_id." };
    if (!parent_id) return { error: "Missing required parent_id." };

    try {
        const url = new URL(`${baseUrl}/v3/menus`);
        url.searchParams.append('project-id', project_id);
        url.searchParams.append('parent_id', parent_id);

        console.log(`[MCP] get_menus calling: ${url.toString()}`);

        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': auth_method,
                'Content-Type': 'application/json',
                'X-API-KEY': x_api_key
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            return {
                error: "Ucode API returned a non-2xx response while fetching menus",
                status: response.status,
                body: errorText,
            };
        }

        const data = await response.json();
        return data; // Return full data as requested
    } catch (error) {
        console.error('Error getting menus:', error);
        return { error: 'An error occurred while getting menus.', details: String(error?.message || error) };
    }
};

/**
 * Tool configuration for getting menus.
 * @type {Object}
 */
const apiTool = {
    function: executeFunction,
    definition: {
        type: 'function',
        function: {
            name: 'get_menus',
            description: 'Retrieve a list of menus for a specific project and parent menu.',
            parameters: {
                type: 'object',
                properties: {
                    project_id: { type: 'string', description: 'The UUID of the project.' },
                    parent_id: { type: 'string', description: 'The UUID of the parent menu/folder.' },
                    x_api_key: { type: 'string', description: 'The X-API-KEY for authentication.' }
                },
                required: ['project_id', 'parent_id', 'x_api_key']
            }
        }
    }
};

export { apiTool };
