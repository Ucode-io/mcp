/**
 * Function to update a table in the Ucode Items API.
 *
 * @param {Object} args - Arguments for the update.
 * @param {string} args.tableSlug - The base URL for the API.
 * @param {string} args.xapikey - The API key for authorization.
 * @param {Array} args.fields - The fields to be updated in the table.
 * @param {Array} args.relations - The relations to be updated in the table.
 * @returns {Promise<Object>} - The result of the table update.
 */
const executeFunction = async ({ tableSlug, xapikey, fields, relations }) => {
  const baseUrl = process.env.BASE_URL || 'https://admin-api.ucode.run';
  const url = `${baseUrl}/v1/table/${tableSlug}/mcp`;
  const auth_method = 'API-KEY';
  const payload = {
    fields,
    relations
  };

  console.log("PAYLOD: ", JSON.stringify(payload));

  try {
    // Set up headers for the request
    const headers = {
      'Authorization': auth_method,
      'X-API-KEY': xapikey,
      'Content-Type': 'application/json'
    };

    // Perform the fetch request
    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload)
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
    console.error('Error updating the table:', error);
    return { error: 'An error occurred while updating the table.' };
  }
};

/**
 * Tool configuration for updating a table in the Ucode Items API.
 * @type {Object}
 */
const apiTool = {
  function: executeFunction,
  definition: {
    type: 'function',
    function: {
      name: 'update_table',
      description: 'Update a table in the Ucode Items API.',
      parameters: {
        type: 'object',
        properties: {
          tableSlug: {
            type: 'string',
            description: 'The table slug for the API.'
          },
          xapikey: {
            type: 'string',
            description: 'The API key for authorization.'
          },
          fields: {
            type: 'array',
            description: 'The fields to be updated in the table.',
            items: {
              type: 'object',
              properties: {
                label: {
                  type: 'string',
                  description: 'The human-readable label for the field.'
                },
                slug: {
                  type: 'string',
                  description: 'The machine-readable slug for the field.'
                },
                type: {
                  type: 'string',
                  description: 'The database type for the field (e.g., VARCHAR, INT, ENUM).'
                },
                action: {
                  type: 'string',
                  description: 'The action to perform on the field (e.g., create, update, delete).'
                },
                enum: {
                  type: 'array',
                  description: 'The enum values for the field. Only required if the type is ENUM.',
                  items: {
                    type: 'string'
                  }
                }
              },
              required: ['label', 'slug', 'type', 'action'],
              additionalProperties: false
            }
          },
          relations: {
            type: 'array',
            description: 'The relations to be updated in the table.',
            items: {
              type: 'object',
              properties: {
                table_to: {
                  type: 'string',
                  description: 'The name of the table to relate to.'
                },
                label_to: {
                  type: 'string',
                  description: 'The label for the related table.'
                },
                type: {
                  type: 'string',
                  description: 'The type of relation (e.g., Many2One, Recursive).'
                },
                action: {
                  type: 'string',
                  description: 'The action to perform on the relation (e.g., create, update, delete).'
                }
              },
              required: ['table_to', 'type', 'label_to', 'action'],
              additionalProperties: false
            }
          }
        },
        required: ['tableSlug', 'xapikey', 'fields', 'relations']
      }
    }
  }
};

export { apiTool };