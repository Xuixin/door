export interface QueryBuilderConfig {
  collectionName: string;
  pushMutation: string;
  pullQuery: string;
  streamSubscription?: string;
}

export class BaseQueryBuilder {
  constructor(private config: QueryBuilderConfig) {}

  getPushMutation(): string {
    return this.config.pushMutation;
  }

  getPullQuery(): string {
    return this.config.pullQuery;
  }

  getStreamSubscription(): string | undefined {
    return this.config.streamSubscription;
  }

  getCollectionName(): string {
    return this.config.collectionName;
  }
}
