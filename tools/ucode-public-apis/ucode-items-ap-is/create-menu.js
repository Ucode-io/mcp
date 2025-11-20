/**
 * Function to create a menu in Ucode API.
 *
 * @param {Object} args - Arguments for creating the menu.
 * @param {string} args.icon - The icon for the menu.
 * @param {Object} args.attributes - The attributes for the menu.
 * @param {string} args.attributes.label - The label for the menu.
 * @param {string} args.attributes.label_en - The English label for the menu.
 * @param {string} args.parent_id - The ID of the parent menu.
 * @param {string} args.type - The type of the menu (e.g., "FOLDER").
 * @param {string} args.label - The label for the menu.
 * @param {string} args.x_api_key - The DBML string to be converted.
 * @returns {Promise<Object>} - The result of the menu creation.
 */
const executeFunction = async ({ icon, attributes, parent_id, type, label, x_api_key }) => {
  const baseUrl = process.env.BASE_URL || 'https://admin-api.ucode.run';
  const xapikey = x_api_key; // will be provided by the user
  const auth_method = 'API-KEY'; // will be provided by the user

  try {
    // Construct the URL for the request
    const url = `${baseUrl}/v2/menus`;

    // Set up the request body
    const body = JSON.stringify({
      icon,
      attributes,
      parent_id,
      type,
      label
    });

    // Set up headers for the request
    const headers = {
      'Content-Type': 'application/json',
      'X-API-KEY': xapikey,
      'Authorization': auth_method
    };

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
    console.error('Error creating menu:', error);
    return { error: 'An error occurred while creating the menu.' };
  }
};

/**
 * Tool configuration for creating a menu in Ucode API.
 * @type {Object}
 */
const apiTool = {
  function: executeFunction,
  definition: {
    type: 'function',
    function: {
      name: 'create_menu',
      description: 'Create a new menu in Ucode API.',
      parameters: {
        type: 'object',
        properties: {
          icon: {
            type: 'string',
            description: 'The icon for the menu.'
          },
          attributes: {
            type: 'object',
            properties: {
              label: {
                type: 'string',
                description: 'The label for the menu.'
              },
              label_en: {
                type: 'string',
                description: 'The English label for the menu.'
              }
            },
            required: ['label', 'label_en']
          },
          parent_id: {
            type: 'string',
            description: 'The ID of the parent menu.'
          },
          type: {
            type: 'string',
            description: 'The type of the menu (e.g., "FOLDER").'
          },
          label: {
            type: 'string',
            description: 'The label for the menu.'
          },
          x_api_key: {
            type: 'string',
            description: 'The X-API-KEY of the environment.'
          }
        },
        required: ['parent_id', 'type', 'label', 'attributes', 'x_api_key']
      }
    }
  }
};

export { apiTool };