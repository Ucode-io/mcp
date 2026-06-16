/**
 * Function to get DBML from the Ucode API.
 *
 * @param {Object} args - Arguments for the request.
 * @param {string} args.projectId - The ID of the project.
 * @param {string} args.environmentId - The ID of the environment.
 * @param {string} args.x_api_key - The X-API-KEY of the environment.
 * @returns {Promise<Object>} - The result of the DBML retrieval.
 */
const executeFunction = async ({ projectId, environmentId, x_api_key }) => {
  const baseUrl = process.env.BASE_URL || 'https://api.admin.u-code.io';
  try {
    // Construct the URL with query parameters
    const url = new URL(`${baseUrl}/v1/chart`);
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': 'API-KEY',
      'X-API-KEY': x_api_key
    };
    url.searchParams.append('project-id', projectId);
    url.searchParams.append('environment-id', environmentId);

    // Perform the fetch request
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers
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
    console.error('Error retrieving DBML:', error);
    return { error: 'An error occurred while retrieving DBML.' };
  }
};

/**
 * Tool configuration for getting DBML from the Ucode API.
 * @type {Object}
 */
const apiTool = {
  function: executeFunction,
  definition: {
    type: 'function',
    function: {
      name: 'get_dbml',
      description: 'Retrieve DBML from the Ucode API.',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    }
  }
};

export { apiTool };