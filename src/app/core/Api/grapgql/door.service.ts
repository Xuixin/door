import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface DoorDocument {
  id: string;
  name: string;
  checkpoint: string;
  client_created_at: string;
  client_updated_at: string;
  server_created_at: string;
  server_updated_at: string;
  deleted: boolean;
}

interface PullDoorsResponse {
  data: {
    pullDoors: {
      documents: DoorDocument[];
    };
  };
}

@Injectable({
  providedIn: 'root',
})
export class DoorApiService {
  private readonly endpoint = environment.apiUrl;

  constructor(private http: HttpClient) {}

  async pullDoors(
    checkpoint = { id: '', server_updated_at: '0' },
  ): Promise<DoorDocument[]> {
    const query = `
      query PullDoors($input: DoorPull!) {
        pullDoors(input: $input) {
          documents {
            id
            name
            max_persons
            client_created_at
            client_updated_at
            server_created_at
            server_updated_at
            deleted
          }
        }
      }
    `;

    const variables = {
      input: {
        checkpoint,
        limit: 100,
      },
    };

    const body = {
      query,
      variables,
    };

    const response = await firstValueFrom(
      this.http.post<PullDoorsResponse>(this.endpoint, body),
    );

    return response.data.pullDoors.documents;
  }
}
