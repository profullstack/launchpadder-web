/**
 * Server-side layout load function
 * Provides authentication state and user data to all pages
 */
export async function load({ locals }) {
  return {
    user: locals.user || null,
    userProfile: locals.userProfile || null,
    locale: locals.locale
  };
}