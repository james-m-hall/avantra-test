const licenses: Record<string, string> = {
  "922ef4eb-57c0-488e-ab05-3f6f1daca5a6": "mock secret license value 1",
  "51ab7a3e-7a0b-4e7f-93e0-9f8fe47d14f6": "mock secret license value 2",
};

/**
 * In a real implementation, we would fetch the license from the assumed external license service.
 * I would assume that this system would have to authenticate to that service in some way.
 * Here we look up licenses from a hard coded list.
 *
 * @param licenseId ID of license to fetch
 */
export const mockFetchLicenseService = (
  licenseId: string,
): Promise<Buffer | null> => {
  if (licenseId in licenses) {
    return Promise.resolve(Buffer.from(licenses[licenseId], "utf-8"));
  }
  return Promise.resolve(null);
};
