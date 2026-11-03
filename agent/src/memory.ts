import { paths } from './config.js';
import { newId, readJson, writeJson } from './store.js';

export interface Memory {
  id: string;
  text: string;
  createdAt: number;
}

const words = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(w => w.length > 2));

/** Things the agent has been told to keep, carried into every run. */
export class MemoryStore {
  private items: Memory[] = readJson<Memory[]>(paths.memory, []);

  list(): Memory[] {
    return [...this.items].sort((a, b) => b.createdAt - a.createdAt);
  }

  add(text: string): Memory {
    const m = { id: newId('mem'), text: text.trim().slice(0, 2000), createdAt: Date.now() };
    this.items.push(m);
    this.save();
    return m;
  }

  remove(id: string): boolean {
    const n = this.items.length;
    this.items = this.items.filter(m => m.id !== id);
    if (this.items.length === n) return false;
    this.save();
    return true;
  }

  search(query: string, limit = 8): Memory[] {
    const q = words(query);
    return this.items
      .map(m => ({ m, score: [...words(m.text)].filter(w => q.has(w)).length }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score || b.m.createdAt - a.m.createdAt)
      .slice(0, limit)
      .map(x => x.m);
  }

  /** The memories worth putting in front of the model for this task: the relevant ones, then the newest. */
  forTask(task: string, limit = 14): Memory[] {
    const picked = new Map(this.search(task, limit).map(m => [m.id, m]));
    for (const m of this.list()) {
      if (picked.size >= limit) break;
      picked.set(m.id, m);
    }
    return [...picked.values()];
  }

  private save() {
    writeJson(paths.memory, this.items);
  }
}
