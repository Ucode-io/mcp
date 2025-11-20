/**
 * Function to create a table in Ucode API.
 *
 * @param {Object} args - Arguments for creating the table.
 * @param {string} args.app_id - The application ID for the table.
 * @param {string} args.label - The label for the table.
 * @param {string} [args.description=""] - The description for the table.
 * @param {string} [args.slug=""] - The slug for the table.
 * @param {boolean} [args.show_in_menu=true] - Whether to show the table in the menu.
 * @param {Object} [args.attributes={}] - Additional attributes for the table.
 * @param {boolean} [args.is_login_table=false] - Whether the table is a login table.
 * @param {boolean} [args.is_cached=false] - Whether the table is cached.
 * @param {boolean} [args.soft_delete=false] - Whether the table supports soft delete.
 * @param {boolean} [args.order_by=false] - Whether to order by the table.
 * @param {string} args.x_api_key - The DBML string to be converted.
 * @returns {Promise<Object>} - The result of the table creation.
 */
const executeFunction = async ({ app_id, label, description = "", slug = "", show_in_menu = true, attributes = {}, is_login_table = false, is_cached = false, soft_delete = false, order_by = false, x_api_key }) => {
  const baseUrl = process.env.BASE_URL || 'https://admin-api.ucode.run';
  const xapikey = x_api_key; // will be provided by the user
  const auth_method = 'API-KEY'; // static value based on the collection
  const requestBody = {
    show_in_menu,
    app_id,
    label,
    description,
    slug,
    icon: "",
    attributes,
    is_login_table,
    is_cached,
    soft_delete,
    order_by
  };

  try {
    // Perform the fetch request
    const response = await fetch(`${baseUrl}/v1/table`, {
      method: 'POST',
      headers: {
        'Authorization': auth_method,
        'Content-Type': 'application/json',
        'X-API-KEY': xapikey
      },
      body: JSON.stringify(requestBody)
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
    console.error('Error creating table:', error);
    return { error: 'An error occurred while creating the table.' };
  }
};

/**
 * Tool configuration for creating a table in Ucode API.
 * @type {Object}
 */
const apiTool = {
  function: executeFunction,
  definition: {
    type: 'function',
    function: {
      name: 'create_table',
      description: 'Create a new table in Ucode API.',
      parameters: {
        type: 'object',
        properties: {
          app_id: {
            type: 'string',
            description: 'The application ID for the table.'
          },
          label: {
            type: 'string',
            description: 'The label for the table.'
          },
          description: {
            type: 'string',
            description: 'The description for the table.'
          },
          slug: {
            type: 'string',
            description: 'The slug for the table.'
          },
          show_in_menu: {
            type: 'boolean',
            description: 'Whether to show the table in the menu.'
          },
          attributes: {
            type: 'object',
            description: 'Additional attributes for the table.'
          },
          is_login_table: {
            type: 'boolean',
            description: 'Whether the table is a login table.'
          },
          is_cached: {
            type: 'boolean',
            description: 'Whether the table is cached.'
          },
          soft_delete: {
            type: 'boolean',
            description: 'Whether the table supports soft delete.'
          },
          order_by: {
            type: 'boolean',
            description: 'Whether to order by the table.'
          },
          x_api_key: {
            type: 'string',
            description: 'The X-API-KEY of the environment.'
          }
        },
        required: ['app_id', 'label', 'x_api_key']
      }
    }
  }
};

export { apiTool };