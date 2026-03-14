const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Billable Tracker API',
      version: '1.0.0',
      description: 'API documentation for the Billable Tracker system',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ['./src/routes/*.js'], // path from exactly where index.js or root starts
};

const specs = swaggerJsdoc(options);

module.exports = specs;
