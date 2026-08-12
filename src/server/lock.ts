/** In-memory single-controller lock for one running profile. Automation is the
 *  implicit holder unless a viewer takes control; see ViewerHub. */
export class ControlLock {
  private current: string | null = null;

  holder(): string | null {
    return this.current;
  }
  has(id: string): boolean {
    return this.current === id;
  }
  take(id: string): boolean {
    if (this.current === null || this.current === id) {
      this.current = id;
      return true;
    }
    return false;
  }
  release(id: string): void {
    if (this.current === id) this.current = null;
  }
}
