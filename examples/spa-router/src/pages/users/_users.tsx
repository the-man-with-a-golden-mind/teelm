import { type VNode } from "teelm";
import { routerLink } from "teelm/router";

export interface UserSummary {
  id: string;
  name: string;
  role: string;
  projects: number;
}

export const USERS: UserSummary[] = [
  { id: "1", name: "Alice Chen", role: "Frontend Lead", projects: 12 },
  { id: "2", name: "Bob Smith", role: "Backend Engineer", projects: 8 },
  { id: "3", name: "Carol Davis", role: "Designer", projects: 15 },
  { id: "4", name: "Dan Wilson", role: "DevOps", projects: 6 },
  { id: "5", name: "Eve Johnson", role: "Full Stack", projects: 10 },
  { id: "6", name: "Frank Brown", role: "Data Engineer", projects: 9 },
];

export function userColor(id: string): string {
  return `hsl(${parseInt(id, 10) * 67 % 360}, 55%, 55%)`;
}

export function UserCard({ user }: { user: UserSummary }): VNode {
  return (
    <a
      key={user.id}
      {...routerLink(`/users/${user.id}`)}
      class="card bg-base-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer no-underline text-inherit"
    >
      <div class="card-body flex-row items-center gap-4">
        <div
          class="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0"
          style={{ background: userColor(user.id) }}
        >
          {user.name[0]}
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-semibold">{user.name}</h3>
          <p class="text-sm text-base-content/60">{user.role}</p>
        </div>
        <div class="badge badge-ghost">{`${user.projects} projects`}</div>
      </div>
    </a>
  );
}
