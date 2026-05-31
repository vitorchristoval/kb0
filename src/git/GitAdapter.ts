import git from 'isomorphic-git';
import fs from 'node:fs';

export interface GitConfig {
  dir: string;
  authorName: string;
  authorEmail: string;
}

export interface CommitSummary {
  sha: string;
  message: string;
  timestamp: number;
}

export class GitAdapter {
  private readonly dir: string;
  private readonly authorName: string;
  private readonly authorEmail: string;

  constructor(config: GitConfig) {
    this.dir = config.dir;
    this.authorName = config.authorName;
    this.authorEmail = config.authorEmail;
  }

  async init(): Promise<void> {
    await git.init({ fs, dir: this.dir });
  }

  async add(filepath: string): Promise<void> {
    await git.add({ fs, dir: this.dir, filepath });
  }

  async remove(filepath: string): Promise<void> {
    await git.remove({ fs, dir: this.dir, filepath });
  }

  async commit(message: string): Promise<string> {
    return git.commit({
      fs,
      dir: this.dir,
      message,
      author: { name: this.authorName, email: this.authorEmail },
    });
  }

  async addAndCommit(filepath: string, message: string): Promise<string> {
    await this.add(filepath);
    return this.commit(message);
  }

  async removeAndCommit(filepath: string, message: string): Promise<string> {
    await this.remove(filepath);
    return this.commit(message);
  }

  async log(depth = 10): Promise<CommitSummary[]> {
    const commits = await git.log({ fs, dir: this.dir, depth });
    return commits.map((c) => ({
      sha: c.oid,
      message: c.commit.message.trim(),
      timestamp: c.commit.author.timestamp,
    }));
  }
}
