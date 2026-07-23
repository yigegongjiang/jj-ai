import { Link } from "react-router";
import type { Route } from "./+types/home";
import pkg from "../../package.json";

export function loader({ context }: Route.LoaderArgs) {
  return {
    name: context.cloudflare.env.HELLO_NAME ?? "jj-ai",
    version: pkg.version,
  };
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return (
    <>
      <h1>Hello, {loaderData.name}!</h1>
      <p>version: {loaderData.version}</p>
      <ul>
        <li>
          <Link to="/llms">llms</Link>
        </li>
      </ul>
    </>
  );
}
