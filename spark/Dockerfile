FROM apache/spark-py:3.3.2

USER root

# Install Python dependencies
RUN pip install --no-cache-dir \
    pyspark==3.3.2 \
    google-cloud-bigquery==2.34.4 \
    pandas==1.5.3 \
    gcsfs==2023.3.0

WORKDIR /app

# Copy Spark application
COPY . .

# Make the script executable
RUN chmod +x /app/stock_processor.py

# Run the processor
CMD ["/app/stock_processor.py"]
