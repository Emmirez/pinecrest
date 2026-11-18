// Ensures a promise takes at least `ms` to resolve, so fast responses
// don't make a loading spinner flash and disappear instantly.
export const minDelay = (promise, ms = 1400) => {
  const delay = new Promise((resolve) => setTimeout(resolve, ms));
  return Promise.all([promise, delay]).then(([result]) => result);
};