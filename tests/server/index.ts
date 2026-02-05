/**
 * Light Browser - Local Test Server
 *
 * A comprehensive test server for all browser capabilities.
 * Uses Bun.serve() for fast, reliable local testing.
 */

import type { Server } from 'bun';

// Test server state
let server: Server | null = null;
let formSubmissions: Array<{ path: string; method: string; data: Record<string, string> }> = [];

/**
 * HTML fixtures for testing
 */
const FIXTURES = {
  // Basic static page
  home: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="description" content="Test page for Light Browser">
  <meta name="keywords" content="test, browser, light">
  <title>Test Home Page</title>
</head>
<body>
  <h1>Welcome to Test Site</h1>
  <p>This is a test page with various content types.</p>

  <h2>Navigation</h2>
  <nav>
    <a href="/about">About Us</a>
    <a href="/products">Products</a>
    <a href="/contact">Contact</a>
    <a href="https://external.com/page">External Link</a>
  </nav>

  <h2>Content Section</h2>
  <article>
    <h3>Article Title</h3>
    <p>This paragraph contains information about pricing and costs. The product costs $99.99 with free shipping.</p>
    <p>Contact us at support@example.com for more information.</p>
  </article>

  <h2>Lists</h2>
  <ul>
    <li>First item</li>
    <li>Second item</li>
    <li>Third item</li>
  </ul>

  <footer>
    <p>Copyright 2024 Test Site</p>
  </footer>
</body>
</html>`,

  // Page with forms
  forms: `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Test Forms</title>
</head>
<body>
  <h1>Form Tests</h1>

  <h2>Login Form (POST)</h2>
  <form id="login-form" action="/submit/login" method="POST">
    <label for="username">Username:</label>
    <input type="text" id="username" name="username" required>

    <label for="password">Password:</label>
    <input type="password" id="password" name="password" required>

    <input type="hidden" name="csrf_token" value="abc123">

    <button type="submit">Login</button>
  </form>

  <h2>Search Form (GET)</h2>
  <form id="search-form" action="/search" method="GET">
    <label for="q">Search:</label>
    <input type="text" id="q" name="q" placeholder="Enter search term">

    <select name="category">
      <option value="all">All Categories</option>
      <option value="products">Products</option>
      <option value="articles">Articles</option>
    </select>

    <button type="submit">Search</button>
  </form>

  <h2>Contact Form (POST with multiple fields)</h2>
  <form id="contact-form" action="/submit/contact" method="POST">
    <label for="name">Name:</label>
    <input type="text" id="name" name="name" required>

    <label for="email">Email:</label>
    <input type="email" id="email" name="email" required>

    <label for="subject">Subject:</label>
    <select id="subject" name="subject">
      <option value="general">General Inquiry</option>
      <option value="support">Support</option>
      <option value="sales">Sales</option>
    </select>

    <label for="message">Message:</label>
    <textarea id="message" name="message" rows="4"></textarea>

    <label>
      <input type="checkbox" name="newsletter" value="yes"> Subscribe to newsletter
    </label>

    <button type="submit">Send Message</button>
  </form>

  <h2>File Upload Form</h2>
  <form id="upload-form" action="/submit/upload" method="POST" enctype="multipart/form-data">
    <label for="file">Choose file:</label>
    <input type="file" id="file" name="file">

    <label for="description">Description:</label>
    <input type="text" id="description" name="description">

    <button type="submit">Upload</button>
  </form>
</body>
</html>`,

  // Page with many links
  links: `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Link Tests</title>
</head>
<body>
  <h1>Link Tests</h1>

  <h2>Internal Links</h2>
  <a href="/">Home</a>
  <a href="/about">About</a>
  <a href="/products">Products</a>
  <a href="/contact">Contact</a>

  <h2>External Links</h2>
  <a href="https://google.com">Google</a>
  <a href="https://github.com">GitHub</a>

  <h2>Download Links</h2>
  <a href="/files/document.pdf" download>Download PDF</a>
  <a href="/files/image.png" download>Download Image</a>

  <h2>Anchor Links</h2>
  <a href="#section1">Jump to Section 1</a>
  <a href="#section2">Jump to Section 2</a>

  <div id="section1">
    <h3>Section 1</h3>
    <p>Content for section 1</p>
  </div>

  <div id="section2">
    <h3>Section 2</h3>
    <p>Content for section 2</p>
  </div>
</body>
</html>`,

  // Page with media
  media: `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Media Tests</title>
</head>
<body>
  <h1>Media Tests</h1>

  <h2>Images</h2>
  <img src="/images/test.png" alt="Test image" width="200" height="100">
  <img src="/images/logo.svg" alt="Logo">
  <img src="https://external.com/image.jpg" alt="External image">

  <h2>Videos</h2>
  <video src="/videos/test.mp4" width="320" height="240" controls>
    Your browser does not support video.
  </video>

  <h2>Audio</h2>
  <audio src="/audio/test.mp3" controls>
    Your browser does not support audio.
  </audio>
</body>
</html>`,

  // Page requiring JavaScript (SPA-like)
  jsRequired: `<!DOCTYPE html>
<html lang="en">
<head>
  <title>JS Required Page</title>
</head>
<body>
  <div id="root"></div>
  <noscript>
    <p>This page requires JavaScript to display content properly.</p>
  </noscript>
  <script>
    document.getElementById('root').innerHTML = '<h1>JavaScript Rendered Content</h1><p>This content was rendered by JavaScript.</p>';
  </script>
</body>
</html>`,

  // About page
  about: `<!DOCTYPE html>
<html lang="en">
<head>
  <title>About Us</title>
</head>
<body>
  <h1>About Us</h1>
  <p>We are a test company for Light Browser testing.</p>
  <p>Our mission is to provide reliable test fixtures.</p>
  <a href="/">Back to Home</a>
</body>
</html>`,

  // Products page
  products: `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Products</title>
</head>
<body>
  <h1>Our Products</h1>

  <div class="product">
    <h2>Product A</h2>
    <p class="price">$49.99</p>
    <p class="description">A great product for testing.</p>
    <a href="/products/a">View Details</a>
  </div>

  <div class="product">
    <h2>Product B</h2>
    <p class="price">$99.99</p>
    <p class="description">An even better product.</p>
    <a href="/products/b">View Details</a>
  </div>

  <div class="product">
    <h2>Product C</h2>
    <p class="price">$149.99</p>
    <p class="description">Our premium offering.</p>
    <a href="/products/c">View Details</a>
  </div>
</body>
</html>`,

  // Search results page
  searchResults: (query: string, category: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Search Results for "${query}"</title>
</head>
<body>
  <h1>Search Results</h1>
  <p>You searched for: <strong>${query}</strong> in category: <strong>${category}</strong></p>

  <div class="results">
    <div class="result">
      <h2>Result 1: ${query} Guide</h2>
      <p>A comprehensive guide about ${query}.</p>
    </div>
    <div class="result">
      <h2>Result 2: ${query} Tutorial</h2>
      <p>Learn everything about ${query}.</p>
    </div>
  </div>

  <a href="/forms">Back to Search</a>
</body>
</html>`,

  // Form submission success
  submitSuccess: (formType: string, data: Record<string, string>) => `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Form Submitted</title>
</head>
<body>
  <h1>Form Submitted Successfully</h1>
  <p>Thank you for submitting the ${formType} form.</p>

  <h2>Received Data:</h2>
  <ul>
    ${Object.entries(data)
      .map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`)
      .join('\n    ')}
  </ul>

  <a href="/forms">Submit Another Form</a>
</body>
</html>`,

  // 404 page
  notFound: `<!DOCTYPE html>
<html lang="en">
<head>
  <title>404 - Not Found</title>
</head>
<body>
  <h1>404 - Page Not Found</h1>
  <p>The requested page could not be found.</p>
  <a href="/">Go to Home</a>
</body>
</html>`,

  // 500 error page
  serverError: `<!DOCTYPE html>
<html lang="en">
<head>
  <title>500 - Server Error</title>
</head>
<body>
  <h1>500 - Internal Server Error</h1>
  <p>Something went wrong on our end.</p>
  <a href="/">Go to Home</a>
</body>
</html>`,
};

/**
 * Parse form data from request body
 */
async function parseFormData(request: Request): Promise<Record<string, string>> {
  const contentType = request.headers.get('content-type') || '';
  const data: Record<string, string> = {};

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const text = await request.text();
    const params = new URLSearchParams(text);
    params.forEach((value, key) => {
      data[key] = value;
    });
  } else if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    formData.forEach((value, key) => {
      if (typeof value === 'string') {
        data[key] = value;
      } else {
        data[key] = `[File: ${value.name}]`;
      }
    });
  }

  return data;
}

/**
 * Create a 1x1 transparent PNG for image tests
 */
function createTestImage(): Uint8Array {
  // Minimal valid PNG (1x1 transparent pixel)
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a, // PNG signature
    0x00,
    0x00,
    0x00,
    0x0d,
    0x49,
    0x48,
    0x44,
    0x52, // IHDR chunk
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    0x00,
    0x00,
    0x01,
    0x08,
    0x06,
    0x00,
    0x00,
    0x00,
    0x1f,
    0x15,
    0xc4,
    0x89,
    0x00,
    0x00,
    0x00,
    0x0a,
    0x49,
    0x44,
    0x41, // IDAT chunk
    0x54,
    0x78,
    0x9c,
    0x63,
    0x00,
    0x01,
    0x00,
    0x00,
    0x05,
    0x00,
    0x01,
    0x0d,
    0x0a,
    0x2d,
    0xb4,
    0x00,
    0x00,
    0x00,
    0x00,
    0x49,
    0x45,
    0x4e,
    0x44,
    0xae, // IEND chunk
    0x42,
    0x60,
    0x82,
  ]);
}

/**
 * Start the test server
 */
export function startTestServer(port: number = 9876): Promise<string> {
  return new Promise((resolve) => {
    formSubmissions = [];

    server = Bun.serve({
      port,
      fetch: async (request) => {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;

        // Route handling
        switch (path) {
          case '/':
            return new Response(FIXTURES.home, {
              headers: { 'Content-Type': 'text/html' },
            });

          case '/about':
            return new Response(FIXTURES.about, {
              headers: { 'Content-Type': 'text/html' },
            });

          case '/products':
            return new Response(FIXTURES.products, {
              headers: { 'Content-Type': 'text/html' },
            });

          case '/forms':
            return new Response(FIXTURES.forms, {
              headers: { 'Content-Type': 'text/html' },
            });

          case '/links':
            return new Response(FIXTURES.links, {
              headers: { 'Content-Type': 'text/html' },
            });

          case '/media':
            return new Response(FIXTURES.media, {
              headers: { 'Content-Type': 'text/html' },
            });

          case '/js-required':
            return new Response(FIXTURES.jsRequired, {
              headers: { 'Content-Type': 'text/html' },
            });

          case '/search': {
            const query = url.searchParams.get('q') || '';
            const category = url.searchParams.get('category') || 'all';
            return new Response(FIXTURES.searchResults(query, category), {
              headers: { 'Content-Type': 'text/html' },
            });
          }

          case '/submit/login':
          case '/submit/contact':
          case '/submit/upload':
            if (method === 'POST') {
              const data = await parseFormData(request);
              const formType = path.split('/').pop() || 'unknown';
              formSubmissions.push({ path, method, data });
              return new Response(FIXTURES.submitSuccess(formType, data), {
                headers: { 'Content-Type': 'text/html' },
              });
            }
            return new Response('Method not allowed', { status: 405 });

          case '/redirect':
            return Response.redirect(`http://localhost:${port}/about`, 302);

          case '/redirect-chain':
            return Response.redirect(`http://localhost:${port}/redirect`, 302);

          case '/error/404':
            return new Response(FIXTURES.notFound, {
              status: 404,
              headers: { 'Content-Type': 'text/html' },
            });

          case '/error/500':
            return new Response(FIXTURES.serverError, {
              status: 500,
              headers: { 'Content-Type': 'text/html' },
            });

          case '/slow':
            await new Promise((r) => setTimeout(r, 2000));
            return new Response('<html><body><h1>Slow Page</h1></body></html>', {
              headers: { 'Content-Type': 'text/html' },
            });

          case '/images/test.png':
          case '/images/logo.svg':
            return new Response(createTestImage(), {
              headers: { 'Content-Type': 'image/png' },
            });

          case '/api/submissions':
            return new Response(JSON.stringify(formSubmissions), {
              headers: { 'Content-Type': 'application/json' },
            });

          case '/api/clear-submissions':
            formSubmissions = [];
            return new Response('OK');

          default:
            return new Response(FIXTURES.notFound, {
              status: 404,
              headers: { 'Content-Type': 'text/html' },
            });
        }
      },
    });

    const baseUrl = `http://localhost:${port}`;
    resolve(baseUrl);
  });
}

/**
 * Stop the test server
 */
export function stopTestServer(): void {
  if (server) {
    server.stop();
    server = null;
  }
}

/**
 * Get form submissions (for test verification)
 */
export function getFormSubmissions(): Array<{
  path: string;
  method: string;
  data: Record<string, string>;
}> {
  return formSubmissions;
}

/**
 * Clear form submissions
 */
export function clearFormSubmissions(): void {
  formSubmissions = [];
}

// Export fixtures for direct access in tests
export { FIXTURES };
