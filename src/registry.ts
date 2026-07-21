import { IPlatformService } from './types';

let platformInstance: IPlatformService<any> | null = null;
let platformLoaderResolve: ((service: IPlatformService<any>) => void) | null = null;

export const platformLoader = new Promise<IPlatformService<any>>((resolve) => {
  platformLoaderResolve = resolve;
});

export const setPlatform = <TSaveData = unknown>(service: IPlatformService<TSaveData>): void => {
  platformInstance = service;
  if (platformLoaderResolve) {
    platformLoaderResolve(service);
  }
};

export const getPlatform = <TSaveData = unknown>(): IPlatformService<TSaveData> => {
  if (!platformInstance) {
    throw new Error('Platform not initialized. Call setPlatform() first.');
  }

  return platformInstance as IPlatformService<TSaveData>;
};
