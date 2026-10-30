import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { ComponentReferenceSelector } from '../workspace/components/ComponentReferenceSelector';
import type { ComponentReference } from '../api/contracts';

describe('ComponentReferenceSelector Component Tests', () => {
  it('renders all three reference options with plain engineering wording', () => {
    const onChange = vi.fn();
    const value: ComponentReference = {
      reference_mode: 'none',
      reference_source_id: null,
      reference_pages: [],
    };

    render(
      <ComponentReferenceSelector
        projectId="PRJ-123"
        drawingSourceId="SRC-001"
        drawingFilename="Sample_HVAC.pdf"
        drawingPageCount={5}
        value={value}
        onChange={onChange}
      />
    );

    expect(screen.getByText('Component / Legend Reference')).toBeInTheDocument();
    expect(screen.getByText('Pages in this PDF')).toBeInTheDocument();
    expect(screen.getByText('Upload a separate reference PDF')).toBeInTheDocument();
    expect(screen.getByText('No component reference')).toBeInTheDocument();
  });

  it('allows selecting pages from the same drawing PDF with 1-based indexing', () => {
    const Wrapper = () => {
      const [ref, setRef] = useState<ComponentReference>({
        reference_mode: 'same_pdf',
        reference_source_id: 'SRC-001',
        reference_pages: [1],
      });
      return (
        <ComponentReferenceSelector
          projectId="PRJ-123"
          drawingSourceId="SRC-001"
          drawingFilename="FloorPlan_M01.pdf"
          drawingPageCount={4}
          value={ref}
          onChange={setRef}
        />
      );
    };

    render(<Wrapper />);

    expect(screen.getByText('Select Component / Legend Pages')).toBeInTheDocument();
    expect(screen.getByText(/FloorPlan_M01\.pdf — Pages: 1/)).toBeInTheDocument();

    // Toggle Page 3
    const page3Text = screen.getByText('Page 3');
    fireEvent.click(page3Text);

    // Now pages 1 and 3 are selected
    expect(screen.getByText(/FloorPlan_M01\.pdf — Pages: 1, 3/)).toBeInTheDocument();

    // Toggle Page 1 off
    const page1Text = screen.getByText('Page 1');
    fireEvent.click(page1Text);

    // Now only page 3 is selected
    expect(screen.getByText(/FloorPlan_M01\.pdf — Pages: 3/)).toBeInTheDocument();
  });

  it('supports Select All and Clear buttons', () => {
    const Wrapper = () => {
      const [ref, setRef] = useState<ComponentReference>({
        reference_mode: 'same_pdf',
        reference_source_id: 'SRC-001',
        reference_pages: [2],
      });
      return (
        <ComponentReferenceSelector
          projectId="PRJ-123"
          drawingSourceId="SRC-001"
          drawingFilename="FullSet.pdf"
          drawingPageCount={3}
          value={ref}
          onChange={setRef}
        />
      );
    };

    render(<Wrapper />);

    // Click Select All
    const selectAllBtn = screen.getByRole('button', { name: /Select All/i });
    fireEvent.click(selectAllBtn);

    expect(screen.getByText(/FullSet\.pdf — Pages: 1, 2, 3/)).toBeInTheDocument();

    // Click Clear
    const clearBtn = screen.getByRole('button', { name: /Clear/i });
    fireEvent.click(clearBtn);

    expect(screen.getByText(/FullSet\.pdf — No pages selected/)).toBeInTheDocument();
  });

  it('switches to separate PDF mode and displays upload prompt', () => {
    const Wrapper = () => {
      const [ref, setRef] = useState<ComponentReference>({
        reference_mode: 'none',
        reference_source_id: null,
        reference_pages: [],
      });
      return (
        <ComponentReferenceSelector
          projectId="PRJ-123"
          drawingSourceId="SRC-001"
          drawingFilename="Mechanical.pdf"
          drawingPageCount={5}
          value={ref}
          onChange={setRef}
        />
      );
    };

    render(<Wrapper />);

    // Switch to separate PDF
    const separateCard = screen.getByText('Upload a separate reference PDF');
    fireEvent.click(separateCard);

    expect(screen.getByText(/Upload Component \/ Legend Reference PDF/i)).toBeInTheDocument();
    expect(screen.getByText(/Choose Reference PDF/i)).toBeInTheDocument();
  });

  it('displays separate PDF pages once uploaded and allows multi-page selection', () => {
    const Wrapper = () => {
      const [ref, setRef] = useState<ComponentReference>({
        reference_mode: 'separate_pdf',
        reference_source_id: 'SRC-LEGEND',
        reference_pages: [1, 2],
      });
      return (
        <ComponentReferenceSelector
          projectId="PRJ-123"
          drawingSourceId="SRC-001"
          drawingFilename="Mechanical.pdf"
          drawingPageCount={5}
          value={ref}
          onChange={setRef}
          referenceFileName="Standard_MEP_Legend.pdf"
          referenceFilePageCount={3}
          referenceSourceId="SRC-LEGEND"
        />
      );
    };

    render(<Wrapper />);

    expect(screen.getByText('Standard_MEP_Legend.pdf')).toBeInTheDocument();
    expect(screen.getByText(/Select all pages containing component\/legend information:/i)).toBeInTheDocument();
    expect(screen.getByText(/Standard_MEP_Legend\.pdf — Pages: 1, 2/)).toBeInTheDocument();

    // Toggle Page 3
    const page3Text = screen.getByText('Page 3');
    fireEvent.click(page3Text);

    expect(screen.getByText(/Standard_MEP_Legend\.pdf — Pages: 1, 2, 3/)).toBeInTheDocument();
  });

  it('switches back to no reference cleanly', () => {
    const Wrapper = () => {
      const [ref, setRef] = useState<ComponentReference>({
        reference_mode: 'same_pdf',
        reference_source_id: 'SRC-001',
        reference_pages: [1, 2],
      });
      return (
        <ComponentReferenceSelector
          projectId="PRJ-123"
          drawingSourceId="SRC-001"
          drawingFilename="Mechanical.pdf"
          drawingPageCount={5}
          value={ref}
          onChange={setRef}
        />
      );
    };

    render(<Wrapper />);

    expect(screen.getByText(/Mechanical\.pdf — Pages: 1, 2/)).toBeInTheDocument();

    // Click No Component Reference
    const noRefCard = screen.getByText('No component reference');
    fireEvent.click(noRefCard);

    expect(screen.getByText(/No external legend or symbol reference supplied/i)).toBeInTheDocument();
    expect(screen.getByText('None (Default Extraction Baseline)')).toBeInTheDocument();
  });
});
