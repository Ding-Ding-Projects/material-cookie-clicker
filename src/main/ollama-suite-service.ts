import type { MaterialCookieClickerOllamaSuiteService } from '../shared/ollama-suite-service.js';
import type { OllamaSuiteState } from '../shared/ollama-suite-types.js';

/**
 * The workspace package intentionally exports TypeScript source. Root build
 * configurations use a different extension policy, so this identifier stays
 * non-literal to keep the package behind its product-owned runtime seam. Vite
 * and the packaged application still resolve the workspace package normally.
 */
const VENDOR_PACKAGE_ID: string = '@material-cookie-clicker/local-ollama';

type VendorController = MaterialCookieClickerOllamaSuiteService;
type VendorModule = {
  LocalOllamaSuiteController: new (options: unknown) => VendorController;
};

export class MaterialCookieClickerOllamaService implements MaterialCookieClickerOllamaSuiteService {
  readonly #controller: VendorController;

  private constructor(controller: VendorController) {
    this.#controller = controller;
  }

  public static async create(options: unknown): Promise<MaterialCookieClickerOllamaService> {
    const vendor = await import(VENDOR_PACKAGE_ID) as VendorModule;
    return new MaterialCookieClickerOllamaService(new vendor.LocalOllamaSuiteController(options));
  }

  public initialize(): Promise<void> { return this.#controller.initialize(); }
  public dispose(): void { this.#controller.dispose(); }
  public snapshot(): OllamaSuiteState { return this.#controller.snapshot(); }
  public subscribe(listener: (state: OllamaSuiteState) => void): () => void { return this.#controller.subscribe(listener); }
  public selectTab(...args: Parameters<VendorController['selectTab']>) { return this.#controller.selectTab(...args); }
  public refreshRuntime(...args: Parameters<VendorController['refreshRuntime']>) { return this.#controller.refreshRuntime(...args); }
  public refreshCatalog(...args: Parameters<VendorController['refreshCatalog']>) { return this.#controller.refreshCatalog(...args); }
  public setSearch(...args: Parameters<VendorController['setSearch']>) { return this.#controller.setSearch(...args); }
  public setCatalogFacets(...args: Parameters<VendorController['setCatalogFacets']>) { return this.#controller.setCatalogFacets(...args); }
  public enqueuePull(...args: Parameters<VendorController['enqueuePull']>) { return this.#controller.enqueuePull(...args); }
  public addToCart(...args: Parameters<VendorController['addToCart']>) { return this.#controller.addToCart(...args); }
  public removeFromCart(...args: Parameters<VendorController['removeFromCart']>) { return this.#controller.removeFromCart(...args); }
  public clearCart(...args: Parameters<VendorController['clearCart']>) { return this.#controller.clearCart(...args); }
  public commitCart(...args: Parameters<VendorController['commitCart']>) { return this.#controller.commitCart(...args); }
  public pauseQueue(...args: Parameters<VendorController['pauseQueue']>) { return this.#controller.pauseQueue(...args); }
  public resumeQueue(...args: Parameters<VendorController['resumeQueue']>) { return this.#controller.resumeQueue(...args); }
  public cancelPull(...args: Parameters<VendorController['cancelPull']>) { return this.#controller.cancelPull(...args); }
  public retryPull(...args: Parameters<VendorController['retryPull']>) { return this.#controller.retryPull(...args); }
  public copyModel(...args: Parameters<VendorController['copyModel']>) { return this.#controller.copyModel(...args); }
  public deleteModel(...args: Parameters<VendorController['deleteModel']>) { return this.#controller.deleteModel(...args); }
  public selectChatModel(...args: Parameters<VendorController['selectChatModel']>) { return this.#controller.selectChatModel(...args); }
  public sendChat(...args: Parameters<VendorController['sendChat']>) { return this.#controller.sendChat(...args); }
  public stopChat(...args: Parameters<VendorController['stopChat']>) { return this.#controller.stopChat(...args); }
  public selectHarnessProfile(...args: Parameters<VendorController['selectHarnessProfile']>) { return this.#controller.selectHarnessProfile(...args); }
  public refreshHarnessExecutables(...args: Parameters<VendorController['refreshHarnessExecutables']>) { return this.#controller.refreshHarnessExecutables(...args); }
  public selectHarnessExecutable(...args: Parameters<VendorController['selectHarnessExecutable']>) { return this.#controller.selectHarnessExecutable(...args); }
  public selectHarnessModel(...args: Parameters<VendorController['selectHarnessModel']>) { return this.#controller.selectHarnessModel(...args); }
  public chooseWorkingDirectory(...args: Parameters<VendorController['chooseWorkingDirectory']>) { return this.#controller.chooseWorkingDirectory(...args); }
  public previewHarness(...args: Parameters<VendorController['previewHarness']>) { return this.#controller.previewHarness(...args); }
  public launchHarness(...args: Parameters<VendorController['launchHarness']>) { return this.#controller.launchHarness(...args); }
  public refreshHarnessSnapshots(...args: Parameters<VendorController['refreshHarnessSnapshots']>) { return this.#controller.refreshHarnessSnapshots(...args); }
  public restoreHarnessSnapshot(...args: Parameters<VendorController['restoreHarnessSnapshot']>) { return this.#controller.restoreHarnessSnapshot(...args); }
}

export function createMaterialCookieClickerOllamaService(options: unknown): Promise<MaterialCookieClickerOllamaService> {
  return MaterialCookieClickerOllamaService.create(options);
}
