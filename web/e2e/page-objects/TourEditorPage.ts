/**
 * Page Object for the Tour Editor page.
 *
 * Encapsulates selectors and common actions for the tour editor.
 */
import { Page, Locator, expect } from '@playwright/test';

export class TourEditorPage {
  readonly page: Page;

  // Main sections
  readonly scenePanel: Locator;
  readonly panoramaViewer: Locator;
  readonly settingsPanel: Locator;
  readonly toolbar: Locator;

  // Scene panel elements
  readonly sceneList: Locator;
  readonly addSceneButton: Locator;
  readonly sceneCards: Locator;

  // Hotspot elements
  readonly hotspotMarkers: Locator;
  readonly addHotspotButton: Locator;
  readonly hotspotEditorModal: Locator;

  // Settings elements
  readonly tourTitleInput: Locator;
  readonly tourDescriptionInput: Locator;
  readonly saveButton: Locator;
  readonly publishButton: Locator;

  // Floor plan elements
  readonly floorPlanOverlay: Locator;
  readonly floorPlanEditor: Locator;

  constructor(page: Page) {
    this.page = page;

    // Main sections
    this.scenePanel = page.locator('[data-testid="scene-panel"], .scene-panel');
    this.panoramaViewer = page.locator('[data-testid="panorama-viewer"], .panorama-viewer, canvas');
    this.settingsPanel = page.locator('[data-testid="settings-panel"], .settings-panel');
    this.toolbar = page.locator('[data-testid="toolbar"], .toolbar, header');

    // Scene panel elements
    this.sceneList = page.locator('[data-testid="scene-list"], .scene-list');
    this.addSceneButton = page.locator('[data-testid="add-scene"], button:has-text("Add Scene")');
    this.sceneCards = page.locator('[data-testid="scene-card"], .scene-card');

    // Hotspot elements
    this.hotspotMarkers = page.locator('[data-testid="hotspot-marker"], .hotspot-marker');
    this.addHotspotButton = page.locator('[data-testid="add-hotspot"], button:has-text("Add Hotspot")');
    this.hotspotEditorModal = page.locator('[data-testid="hotspot-editor-modal"], .hotspot-editor-modal');

    // Settings elements
    this.tourTitleInput = page.locator('input[name="title"], [data-testid="tour-title"]');
    this.tourDescriptionInput = page.locator('textarea[name="description"], [data-testid="tour-description"]');
    this.saveButton = page.locator('button:has-text("Save"), [data-testid="save-button"]');
    this.publishButton = page.locator('button:has-text("Publish"), [data-testid="publish-button"]');

    // Floor plan elements
    this.floorPlanOverlay = page.locator('[data-testid="floor-plan-overlay"], .floor-plan-overlay');
    this.floorPlanEditor = page.locator('[data-testid="floor-plan-editor"], .floor-plan-editor');
  }

  /**
   * Navigate to the tour editor for a specific tour.
   */
  async goto(tourId: string) {
    await this.page.goto(`/tours/${tourId}/edit`);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Wait for the editor to fully load.
   */
  async waitForEditorLoad() {
    await expect(this.panoramaViewer.or(this.scenePanel)).toBeVisible({ timeout: 10000 });
  }

  /**
   * Get the number of scenes in the tour.
   */
  async getSceneCount(): Promise<number> {
    return await this.sceneCards.count();
  }

  /**
   * Select a scene by index.
   */
  async selectScene(index: number) {
    const scene = this.sceneCards.nth(index);
    await scene.click();
  }

  /**
   * Add a new scene by uploading an image.
   */
  async addScene(imagePath: string) {
    await this.addSceneButton.click();

    // Handle file upload
    const fileChooser = await this.page.waitForEvent('filechooser');
    await fileChooser.setFiles(imagePath);
  }

  /**
   * Drag and drop to reorder scenes.
   */
  async reorderScene(fromIndex: number, toIndex: number) {
    const fromScene = this.sceneCards.nth(fromIndex);
    const toScene = this.sceneCards.nth(toIndex);

    await fromScene.dragTo(toScene);
  }

  /**
   * Click on the panorama viewer to add a hotspot.
   */
  async clickOnPanorama(x: number, y: number) {
    const viewerBox = await this.panoramaViewer.boundingBox();
    if (viewerBox) {
      await this.page.mouse.click(viewerBox.x + x, viewerBox.y + y);
    }
  }

  /**
   * Get the number of hotspots in the current scene.
   */
  async getHotspotCount(): Promise<number> {
    return await this.hotspotMarkers.count();
  }

  /**
   * Click on a hotspot by index.
   */
  async clickHotspot(index: number) {
    await this.hotspotMarkers.nth(index).click();
  }

  /**
   * Fill in the hotspot editor modal.
   */
  async fillHotspotEditor(options: {
    title?: string;
    description?: string;
    targetSceneId?: string;
    type?: 'navigation' | 'info' | 'link';
  }) {
    await expect(this.hotspotEditorModal).toBeVisible();

    if (options.title) {
      await this.hotspotEditorModal.locator('input[name="title"]').fill(options.title);
    }
    if (options.description) {
      await this.hotspotEditorModal.locator('textarea[name="description"]').fill(options.description);
    }
    if (options.type) {
      await this.hotspotEditorModal.locator(`input[value="${options.type}"]`).click();
    }
    if (options.targetSceneId) {
      await this.hotspotEditorModal.locator('select[name="targetScene"]').selectOption(options.targetSceneId);
    }
  }

  /**
   * Save the hotspot in the editor modal.
   */
  async saveHotspot() {
    await this.hotspotEditorModal.locator('button:has-text("Save")').click();
    await expect(this.hotspotEditorModal).not.toBeVisible();
  }

  /**
   * Delete the current hotspot in the editor modal.
   */
  async deleteHotspot() {
    await this.hotspotEditorModal.locator('button:has-text("Delete")').click();
    // Confirm deletion if dialog appears
    const confirmButton = this.page.locator('button:has-text("Confirm"), button:has-text("Yes")');
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    }
  }

  /**
   * Update tour settings.
   */
  async updateTourSettings(options: { title?: string; description?: string }) {
    if (options.title) {
      await this.tourTitleInput.fill(options.title);
    }
    if (options.description) {
      await this.tourDescriptionInput.fill(options.description);
    }
  }

  /**
   * Save the tour.
   */
  async saveTour() {
    await this.saveButton.click();
    // Wait for save confirmation
    await this.page.waitForResponse((response) =>
      response.url().includes('/tours') && response.ok()
    ).catch(() => {});
  }

  /**
   * Publish the tour.
   */
  async publishTour() {
    await this.publishButton.click();
    // Wait for publish confirmation
    await this.page.waitForResponse((response) =>
      response.url().includes('/publish') && response.ok()
    ).catch(() => {});
  }
}
