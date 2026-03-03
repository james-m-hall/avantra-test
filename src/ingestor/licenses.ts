import { LRUCache } from "lru-cache";
import { mockFetchLicenseService } from "./mockLicenses";

// Assumes that a new license comes with a new license ID so we don't need
// to worry about evicting old license values from the cache based on time
const licenseCache = new LRUCache<string, Buffer>({
  max: 500,
});

/**
 * Gets the license for a given license ID.
 *
 * License fetching uses an in memory cache (as we would for an external call) to avoid the overhead of
 * fetching the license for every request.
 * @param licenseId ID of license to fetch
 * @return license value or null if license cannot be found
 */
export const getLicense = async (licenseId: string): Promise<Buffer | null> => {
  const cachedLicense = licenseCache.get(licenseId);

  if (cachedLicense) {
    return cachedLicense;
  }

  const license = await mockFetchLicenseService(licenseId);

  if (license) {
    licenseCache.set(licenseId, license);
    return license;
  }

  return null;
};
