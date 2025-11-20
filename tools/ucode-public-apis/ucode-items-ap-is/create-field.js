/**
 * Function to create a field in Ucode Items API.
 *
 * @param {Object} args - Arguments for creating a field.
 * @param {string} args.label - The label for the field.
 * @param {string} args.defaultValue - The default value for the field.
 * @param {string} args.label_en - The English label for the field.
 * @param {boolean} args.enable_multilanguage - Whether to enable multilanguage support.
 * @param {string} args.table_id - The ID of the table to which the field belongs.
 * @param {string} args.slug - The slug for the field.
 * @param {string} args.type - The type of the field (e.g., SINGLE_LINE).
 * @param {boolean} args.required - Whether the field is required.
 * @param {string} args.x_api_key - The DBML string to be converted.
 * @returns {Promise<Object>} - The result of the field creation.
 */
const executeFunction = async ({ label, defaultValue, label_en, enable_multilanguage, table_id, slug, type, required, x_api_key, collection }) => {
  const baseUrl = process.env.BASE_URL || 'https://admin-api.ucode.run';
  const xapikey = x_api_key; 
  const table = collection; // path variable
  const url = `${baseUrl}/v2/fields/${table}`;

  const body = {
    attributes: {
      label: label || '',
      defaultValue: defaultValue || '',
      label_en: label_en || 'Name',
      enable_multilanguage: enable_multilanguage || false,
      number_of_rounds: null
    },
    default: '',
    label: label || 'Name',
    required: required || false,
    slug: slug || 'name',
    table_id: table_id,
    type: type || 'SINGLE_LINE',
    enable_multilanguage: enable_multilanguage || false,
    show_label: true
  };

  try {
    const headers = {
      'Authorization': 'API-KEY',
      'Content-Type': 'application/json',
      'X-API-KEY': xapikey
    };

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error creating field:', error);
    return { error: 'An error occurred while creating the field.' };
  }
};

/**
 * Tool configuration for creating a field in Ucode Items API.
 * @type {Object}
 */
const apiTool = {
  function: executeFunction,
  definition: {
    type: 'function',
    function: {
      name: 'create_field',
      description: 'Create a field in Ucode Items API.',
      parameters: {
        type: 'object',
        properties: {
          label: {
            type: 'string',
            description: 'The label for the field.'
          },
          defaultValue: {
            type: 'string',
            description: 'The default value for the field.'
          },
          label_en: {
            type: 'string',
            description: 'The English label for the field.'
          },
          enable_multilanguage: {
            type: 'boolean',
            description: 'Whether to enable multilanguage support.'
          },
          table_id: {
            type: 'string',
            description: 'The ID of the table to which the field belongs.'
          },
          slug: {
            type: 'string',
            description: 'The slug for the field.'
          },
          type: {
            type: 'string',
            description: 'The type of the field (e.g., SINGLE_LINE).'
          },
          required: {
            type: 'boolean',
            description: 'Whether the field is required.'
          },
          x_api_key: {
            type: 'string',
            description: 'The X-API-KEY of the environment.'
          },
          collection: {
            type: 'string',
            description: 'The collection to which the field belongs (e.g., relaunch).',
          }
        },
        required: ['table_id', 'slug', 'type', 'x_api_key']
      }
    }
  }
};

export { apiTool };