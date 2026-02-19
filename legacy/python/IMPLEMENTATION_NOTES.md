# Implementation Notes

Last reviewed: 2026-02-19


## State-of-the-Art Verification

### Dependencies Verified (January 2026)

#### OpenAI Models
- **Current Flagship Model**: GPT-5.2 (released December 2025)
- **Previous Flagship**: GPT-5.1 (superseded by GPT-5.2)
- **Key Improvements in GPT-5.2**:
  - General intelligence improvements
  - Better instruction following
  - Enhanced accuracy and token efficiency
  - Improved multimodality (vision)
  - Better code generation (front-end UI)
  - Improved tool calling and context management
  - New `xhigh` reasoning effort level
  - Concise reasoning summaries
  - Context compaction support

#### OpenAI Agents SDK
- **Current Version**: 0.7.0 (released January 22, 2026)
- **Installation**: `pip install openai-agents>=0.7.0`
- **Key Features**:
  - Agent orchestration and handoffs
  - Built-in tools (web_search, file_search, code_interpreter)
  - Tracing and monitoring
  - Session management
  - Parallel tool execution

### Model Selection Strategy

| Agent | Model | Reasoning | Rationale |
|-------|-------|-----------|-----------|
| Coordinator | GPT-5.2 | High | Complex orchestration, conflict resolution |
| Finance | GPT-5.2 | High | Complex financial modeling, sensitivity analysis |
| Research | GPT-5.1 | Medium | Market research, data synthesis |
| Legal | GPT-5.1 | Medium | Contract analysis, zoning interpretation |
| Design | GPT-5.1 | Medium | Site planning, capacity calculations |
| Operations | GPT-5.1 | Medium | Scheduling, cost tracking |
| Marketing | GPT-5.1 | Medium | Content generation, market positioning |
| Risk | GPT-5.1 | Medium | Risk assessment, insurance analysis |

---

## Key Implementation Decisions

### 1. Agent Architecture

**Decision**: Hierarchical structure with Coordinator as central hub

**Rationale**:
- Single entry point for all requests
- Consistent routing logic
- Easier to add new agents
- Clear separation of concerns

**Alternative Considered**: Peer-to-peer agent communication
- Rejected due to complexity and harder debugging

### 2. Database Selection

**Decision**: Supabase (PostgreSQL + Realtime)

**Rationale**:
- Managed PostgreSQL
- Built-in authentication
- Realtime subscriptions
- Row Level Security
- Generous free tier

**Alternative Considered**: Self-hosted PostgreSQL
- Rejected due to operational overhead

### 3. External API Strategy

**Decision**: Multiple specialized APIs

| API | Purpose | Fallback |
|-----|---------|----------|
| Perplexity Sonar Pro | Real-time research | OpenAI web_search |
| Google Maps/Places | Location analysis | Manual research |
| FEMA Flood Maps | Flood zone data | Manual lookup |

### 4. File Storage

**Decision**: Backblaze B2 (S3-compatible)

**Rationale**:
- Cost-effective ($0.005/GB/month)
- S3-compatible API
- No egress fees
- Good for documents

### 5. Financial Calculations

**Decision**: Custom financial calculator module

**Rationale**:
- Full control over calculations
- No external dependencies
- Easy to audit
- Industry-standard formulas

**Key Formulas Implemented**:
- IRR (Internal Rate of Return)
- NPV (Net Present Value)
- Equity Multiple
- Cash-on-Cash Return
- DSCR (Debt Service Coverage Ratio)
- LTV (Loan-to-Value)
- Debt Yield
- Mortgage Payment (amortization)

### 6. Prompt Engineering

**Decision**: Comprehensive system prompts with examples

**Rationale**:
- Consistent agent behavior
- Clear output formats
- Reduced hallucination
- Better tool usage

**Prompt Structure**:
1. Role definition
2. Core capabilities
3. Tools available
4. Output standards
5. Geographic focus
6. Example formats

### 7. Error Handling

**Decision**: Graceful degradation with fallback responses

**Implementation**:
- Try-catch around API calls
- Return partial results on failure
- Log errors for debugging
- Provide human-readable messages

### 8. Testing Strategy

**Decision**: Multi-level testing

| Level | Scope | Tools |
|-------|-------|-------|
| Unit | Individual functions | pytest |
| Integration | API clients | pytest-asyncio |
| End-to-End | Full workflows | Manual/API tests |

---

## Louisiana-Specific Considerations

### Legal Framework
- Civil law jurisdiction (Napoleonic Code)
- Community property state
- No deficiency judgments on purchase money mortgages
- Forced heirship considerations
- Notarial requirements for real estate

### East Baton Rouge Parish
- Unified Development Code (UDC)
- Planning Commission procedures
- Metro Council approval process
- BREC dedication requirements
- Traffic impact study thresholds

### Market Characteristics
- Hurricane/tropical storm exposure
- Flood-prone areas
- Industrial pollution legacy (southern parishes)
- Subsidence and soil conditions

---

## Performance Considerations

### API Rate Limits
| Service | Limit | Strategy |
|---------|-------|----------|
| OpenAI | Tier-based | Request batching |
| Perplexity | 100/min | Queue requests |
| Google Maps | 100/day free | Cache results |
| FEMA | No limit | Cache aggressively |

### Caching Strategy
- Flood zone data: 30 days
- Market data: 7 days
- Parcel data: 1 day
- Agent outputs: Permanent (in DB)

### Cost Optimization
- Use GPT-5.2 only for complex tasks
- Use GPT-5.1 for standard tasks
- Cache external API responses
- Batch database operations

---

## Security Considerations

### API Keys
- Store in environment variables
- Never commit to repository
- Rotate regularly
- Use least-privilege access

### Database
- Row Level Security enabled
- Service key for backend
- Anon key for frontend (if applicable)
- Encrypt sensitive fields

### File Storage
- Presigned URLs for downloads
- Validate file types
- Scan for malware
- Limit file sizes

---

## Scalability Considerations

### Horizontal Scaling
- Stateless API design
- Database connection pooling
- Externalize session state
- Use message queues for async tasks

### Vertical Scaling
- Optimize database queries
- Use connection caching
- Compress large responses
- Implement pagination

---

## Monitoring and Observability

### Tracing
- OpenAI Agents SDK built-in tracing
- Custom spans for external APIs
- Request/response logging
- Performance metrics

### Alerts
- API rate limit approaching
- Database connection failures
- External API errors
- High error rates

### Dashboards
- Agent usage by type
- Request latency
- Error rates
- Cost tracking

---

## Known Limitations

### 1. External API Dependencies
- Perplexity API availability
- Google Maps quota limits
- FEMA data accuracy

### 2. Model Limitations
- Token limits (400k for GPT-5.2)
- Hallucination risk
- Training data cutoff

### 3. Geographic Scope
- Optimized for Louisiana
- May need tuning for other markets
- Local regulations vary

### 4. Financial Modeling
- Simplified assumptions
- Should be validated by professionals
- Market-specific adjustments needed

---

## Future Enhancements

### Near-term (1-3 months)
- [ ] Real-time market data feeds
- [ ] Advanced visualization (charts, maps)
- [ ] Document parsing with OCR
- [ ] Email notifications

### Medium-term (3-6 months)
- [ ] Mobile application
- [ ] Predictive analytics
- [ ] Integration with accounting systems
- [ ] Automated reporting

### Long-term (6+ months)
- [ ] Machine learning for comp selection
- [ ] Natural language queries
- [ ] Voice interface
- [ ] Blockchain for document verification

---

## Development Workflow

### Local Development
```bash
# 1. Clone repository
git clone <repo-url>
cd gallagher-cres

# 2. Create virtual environment
python -m venv venv
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env
# Edit .env with API keys

# 5. Run tests
make test

# 6. Start development server
make dev
```

### Code Quality
```bash
# Format code
make format

# Run linters
make lint

# Type checking
make type-check

# Run tests with coverage
make test-coverage
```

### Deployment
```bash
# Build Docker image
make docker-build

# Run with docker-compose
make docker-up

# View logs
make docker-logs
```

---

## Support and Maintenance

### Regular Tasks
- Monitor API usage and costs
- Review and rotate API keys
- Update dependencies monthly
- Backup database weekly
- Review error logs daily

### Troubleshooting
- Check `/health` endpoint
- Review application logs
- Verify API key validity
- Check database connections

---

## References

### Documentation
- OpenAI Agents SDK: https://platform.openai.com/docs/guides/agents-sdk
- GPT-5.2: https://platform.openai.com/docs/changelog
- FastAPI: https://fastapi.tiangolo.com/
- Supabase: https://supabase.com/docs

### External APIs
- Perplexity: https://docs.perplexity.ai/
- Google Maps: https://developers.google.com/maps
- FEMA Flood: https://www.fema.gov/flood-maps

---

**Last Updated**: January 2026
**Version**: 1.0.0
**Maintainer**: Gallagher Property Company Tech Team
