/**
 * Connection Utilities
 * Shared connection checking logic for GraphQL servers
 */

/**
 * Check connection to GraphQL server
 * @param url - GraphQL server URL to check
 * @param timeoutMs - Timeout in milliseconds (default: 5000)
 * @returns Promise<boolean> - true if connection successful, false otherwise
 */
export async function checkGraphQLConnection(
  url: string,
  timeoutMs: number = 5000,
): Promise<boolean> {
  try {
    console.log(`🔍 [ConnectionUtils] Checking connection to server: ${url}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: '{ __typename }', // Simple introspection query
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      console.log(
        `✅ [ConnectionUtils] Connection to GraphQL server successful: ${url}`,
      );
      return true;
    } else {
      console.log(
        `⚠️ [ConnectionUtils] GraphQL server responded with error: ${response.status} (${url})`,
      );
      return false;
    }
  } catch (error: any) {
    console.log(
      `❌ [ConnectionUtils] Connection check failed for ${url}:`,
      error.message || error,
    );
    return false;
  }
}
