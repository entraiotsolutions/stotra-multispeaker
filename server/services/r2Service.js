// Cloudflare R2 Service - Handles file uploads to R2
// Note: LiveKit Egress handles the upload directly, but this service can be used for other operations

const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const config = require('../config');

class R2Service {
  constructor() {
    // R2 is S3-compatible, so we use AWS SDK
    // Clean endpoint URL (remove trailing slashes and any path)
    // Endpoint should be: https://<account-id>.r2.cloudflarestorage.com
    let cleanEndpoint = config.r2.endpoint ? config.r2.endpoint.trim() : null;
    if (cleanEndpoint) {
      if (cleanEndpoint.endsWith('/')) {
        cleanEndpoint = cleanEndpoint.slice(0, -1);
      }
      // Remove any path after the domain (bucket name might be in path)
      const urlParts = cleanEndpoint.split('/');
      if (urlParts.length > 3) {
        cleanEndpoint = urlParts.slice(0, 3).join('/');
      }
    }
    
    // For Cloudflare R2, use 'us-east-1' region if 'auto' is specified
    // (AWS SDK doesn't support 'auto' region)
    const r2Region = config.r2.region === 'auto' ? 'us-east-1' : (config.r2.region || 'us-east-1');
    
    this.s3Client = new S3Client({
      region: r2Region,
      endpoint: cleanEndpoint,
      forcePathStyle: true, // R2 requires path-style URLs
      credentials: {
        accessKeyId: config.r2.accessKeyId,
        secretAccessKey: config.r2.secretAccessKey,
      },
    });
  }

  /**
   * Upload a file to R2
   * @param {string} key - Object key (file path)
   * @param {Buffer} body - File content
   * @param {string} contentType - MIME type
   * @returns {Promise<string>} Public URL
   */
  async uploadFile(key, body, contentType = 'application/octet-stream') {
    try {
      const command = new PutObjectCommand({
        Bucket: config.r2.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      });

      await this.s3Client.send(command);
      console.log(`[R2Service] File uploaded: ${key}`);

      // Return public URL using configured public URL
      return this.getPublicUrl(key);
    } catch (error) {
      console.error(`[R2Service] Error uploading file:`, error);
      throw error;
    }
  }

  /**
   * Get file from R2
   * @param {string} key - Object key
   * @returns {Promise<Buffer>}
   */
  async getFile(key) {
    try {
      const command = new GetObjectCommand({
        Bucket: config.r2.bucket,
        Key: key,
      });

      const response = await this.s3Client.send(command);
      const chunks = [];
      
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }

      return Buffer.concat(chunks);
    } catch (error) {
      console.error(`[R2Service] Error getting file:`, error);
      throw error;
    }
  }

  /**
   * Generate a public URL for an R2 object
   * @param {string} key - Object key
   * @returns {string} Public URL
   */
  getPublicUrl(key) {
    // Use configured public URL (R2 public bucket URL or custom domain)
    if (config.r2.publicUrl) {
      // Ensure the public URL doesn't have a trailing slash
      const baseUrl = config.r2.publicUrl.replace(/\/$/, '');
      return `${baseUrl}/${key}`;
    }
    
    // Fallback to constructed URL if public URL not configured
    return `https://${config.r2.bucket}.r2.cloudflarestorage.com/${key}`;
  }
}

module.exports = new R2Service();
