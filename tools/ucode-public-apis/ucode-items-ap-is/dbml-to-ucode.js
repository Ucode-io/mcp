/**
 * Function to convert DBML to Ucode.
 *
 * @param {Object} args - Arguments for the conversion.
 * @param {string} args.dbml - The DBML string to be converted.
 * @param {string} args.x_api_key - The DBML string to be converted.
 * @param {Object} args.view_fields - The DBML string to be converted.
 * @param {Object} args.menus - An object where each value is an array of strings ([]string).
 * @returns {Promise<Object>} - The result of the conversion.
 */
const executeFunction = async ({ dbml, x_api_key, view_fields, menus }) => {
  const baseUrl = process.env.BASE_URL || 'https://admin-api.ucode.run'; // Base URL for the API
  const apiKey = x_api_key;
  const authMethod = 'API-KEY'; // will be provided by the user
  try {
    // Construct the URL for the request
    const url = `${baseUrl}/v1/dbml-to-ucode`;

    // Set up headers for the request
    const headers = {
      'Authorization': authMethod,
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey
    };

    // Prepare the body of the request
    const body = JSON.stringify({ dbml: dbml, view_fields, menus });
    console.log('Converting DBML to Ucode:', body);

    // Perform the fetch request
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body
    });

    // Check if the response was successful
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData);
    }

    // Parse and return the response data
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error converting DBML to Ucode:', error);
    return { error: 'An error occurred while converting DBML to Ucode.' };
  }
};

/**
 * Tool configuration for converting DBML to Ucode.
 * @type {Object}
 */
const apiTool = {
  function: executeFunction,
  definition: {
    type: 'function',
    function: {
      name: 'dbml_to_ucode',
      description: 'Convert DBML to Ucode.',
      parameters: {
        type: 'object',
        properties: {
          dbml: {
            type: 'string',
            description: 'The DBML string to be converted.'
          },
          x_api_key: {
            type: 'string',
            description: 'The X-API-KEY of the environment.'
          },
          view_fields: {
            type: 'object',
            description: 'Additional dynamic view_fields (keys and values can vary).',
            additionalProperties: true // <— allows dynamic fields
          },
          menus: {
            type: 'object',
            description: 'An object where each value is an array of strings ([]string).',
            additionalProperties: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        },
        required: ['dbml', 'x_api_key', 'view_fields', 'menus']
      }
    }
  }
};

export { apiTool };