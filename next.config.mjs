/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "export", // site estático (GitHub Pages)
  basePath: process.env.BASE_PATH ?? "",
  trailingSlash: true,
};
export default nextConfig;
