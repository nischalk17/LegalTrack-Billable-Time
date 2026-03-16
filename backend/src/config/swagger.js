const swaggerJsdoc = require('swagger-jsdoc');
const path = require('path');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Billable Tracker API',
      version: '1.0.0',
      description: 'API documentation for the Billable Tracker system',
    },
    tags: [
      { name: 'Auth', description: 'Authentication and current user' },
      { name: 'Entries', description: 'Manual time entries' },
      { name: 'Activities', description: 'Tracked activities ingestion and management' },
      { name: 'Sessions', description: 'Active client/matter sessions' },
      { name: 'Rules', description: 'Tracking rules for auto-tagging activities' },
      { name: 'Clients', description: 'Client CRUD' },
      { name: 'Bills', description: 'Billing & invoices' },
      { name: 'Reports', description: 'Reporting endpoints (including PDFs)' },
      { name: 'Analytics', description: 'Analytics dashboards and aggregates' },
      { name: 'Suggestions', description: 'Billable suggestion generation and workflow' },
      { name: 'System', description: 'Health and system endpoints' },
    ],
    servers: [
      {
        url: 'http://localhost:{port}',
        description: 'Local development server',
        variables: { port: { default: '4000' } },
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: { error: { type: 'string', example: 'Server error' } },
        },
        ValidationErrorResponse: {
          type: 'object',
          properties: {
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string', example: 'field' },
                  msg: { type: 'string', example: 'Validation error message' },
                  path: { type: 'string', example: 'email' },
                  location: { type: 'string', example: 'body' },
                },
              },
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', example: 'b3b2a2f0-0c7b-4c86-8c2c-0b7c9f0f3f7a' },
            email: { type: 'string', format: 'email', example: 'demo@legaltrack.com' },
            name: { type: 'string', example: 'Demo Lawyer' },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        AuthResponse: {
          type: 'object',
          properties: {
            token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
            user: { $ref: '#/components/schemas/User' },
          },
        },
        ManualEntry: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            client: { type: 'string', example: 'Acme Corp' },
            matter: { type: 'string', nullable: true, example: 'Contract Review' },
            description: { type: 'string', example: 'Reviewed agreement and marked redlines' },
            date: { type: 'string', format: 'date', example: '2026-03-16' },
            duration_minutes: { type: 'integer', example: 90 },
            source_type: { type: 'string', example: 'manual' },
            notes: { type: 'string', nullable: true, example: 'Follow up with client on clause 4.' },
            client_id: { type: 'string', format: 'uuid', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        TrackedActivity: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            source_type: { type: 'string', enum: ['browser', 'desktop'] },
            app_name: { type: 'string', nullable: true, example: 'Chrome' },
            window_title: { type: 'string', nullable: true, example: 'Westlaw - Search Results' },
            domain: { type: 'string', nullable: true, example: 'westlaw.com' },
            file_name: { type: 'string', nullable: true, example: 'Motion_Draft_v2.docx' },
            url: { type: 'string', nullable: true, example: 'https://westlaw.com/...' },
            start_time: { type: 'string', format: 'date-time' },
            end_time: { type: 'string', format: 'date-time' },
            duration_seconds: { type: 'integer', example: 300 },
            client_id: { type: 'string', format: 'uuid', nullable: true },
            matter: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
        Client: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            name: { type: 'string', example: 'Acme Corp' },
            contact_person: { type: 'string', nullable: true, example: 'Alex Doe' },
            email: { type: 'string', nullable: true, example: 'alex@acme.com' },
            phone: { type: 'string', nullable: true, example: '+977-9800000000' },
            address: { type: 'string', nullable: true },
            pan_number: { type: 'string', nullable: true, example: '123456789' },
            default_hourly_rate: { type: 'integer', example: 5000 },
            is_vat_applicable: { type: 'boolean', example: true },
            notes: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
          },
        },
        ClientWithTotals: {
          allOf: [
            { $ref: '#/components/schemas/Client' },
            { type: 'object', properties: { total_billed: { type: 'integer', example: 150000 } } },
          ],
        },
        TrackingRule: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            client_id: { type: 'string', format: 'uuid' },
            matter: { type: 'string', nullable: true },
            rule_type: { type: 'string', enum: ['domain', 'app_name', 'window_title', 'file_extension'] },
            pattern: { type: 'string', example: 'westlaw.com' },
            match_type: { type: 'string', enum: ['exact', 'contains', 'starts_with'], example: 'contains' },
            priority: { type: 'integer', example: 10 },
            created_at: { type: 'string', format: 'date-time' },
            client_name: { type: 'string', nullable: true, example: 'Acme Corp' },
          },
        },
        ActiveSession: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            client_id: { type: 'string', format: 'uuid' },
            matter: { type: 'string', nullable: true },
            started_at: { type: 'string', format: 'date-time' },
            ended_at: { type: 'string', format: 'date-time', nullable: true },
            is_active: { type: 'boolean', example: true },
            client_name: { type: 'string', nullable: true },
          },
        },
        BillLineItem: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            bill_id: { type: 'string', format: 'uuid' },
            entry_id: { type: 'string', format: 'uuid', nullable: true },
            description: { type: 'string' },
            date: { type: 'string', format: 'date' },
            duration_minutes: { type: 'integer' },
            hourly_rate_npr: { type: 'integer' },
            amount_npr: { type: 'integer' },
            source: { type: 'string', enum: ['manual', 'tracked'] },
          },
        },
        Bill: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            client_id: { type: 'string', format: 'uuid' },
            bill_number: { type: 'string', example: 'INV-2026-001' },
            matter: { type: 'string', nullable: true },
            date_from: { type: 'string', format: 'date' },
            date_to: { type: 'string', format: 'date' },
            subtotal_npr: { type: 'integer' },
            vat_amount_npr: { type: 'integer' },
            total_npr: { type: 'integer' },
            status: { type: 'string', enum: ['draft', 'sent', 'paid'] },
            notes: { type: 'string', nullable: true },
            created_at: { type: 'string', format: 'date-time' },
            updated_at: { type: 'string', format: 'date-time' },
            client_name: { type: 'string', nullable: true },
          },
        },
        BillWithLineItems: {
          allOf: [
            { $ref: '#/components/schemas/Bill' },
            { type: 'object', properties: { line_items: { type: 'array', items: { $ref: '#/components/schemas/BillLineItem' } } } },
          ],
        },
        BillableSuggestion: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            user_id: { type: 'string', format: 'uuid' },
            activity_id: { type: 'string', format: 'uuid', nullable: true },
            description: { type: 'string' },
            category: { type: 'string' },
            app_name: { type: 'string', nullable: true },
            domain: { type: 'string', nullable: true },
            duration_minutes: { type: 'integer' },
            date: { type: 'string', format: 'date' },
            status: { type: 'string', enum: ['pending', 'accepted', 'dismissed'] },
            created_at: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [path.join(__dirname, '../routes/*.js'), path.join(__dirname, '../index.js')],
};

const specs = swaggerJsdoc(options);

module.exports = specs;
