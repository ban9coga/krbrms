import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { eventId: string; motoId: string } }
) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(
        { error: 'Server configuration error.' },
        { status: 500 }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    // Ensure the moto belongs to the event
    const { data: moto, error: motoError } = await supabase
      .from('motos')
      .select('id')
      .eq('id', params.motoId)
      .eq('event_id', params.eventId)
      .single()

    if (motoError || !moto) {
      return NextResponse.json(
        { error: 'Moto not found or does not belong to this event.' },
        { status: 404 }
      )
    }

    // 1. Delete associated results
    const { error: resultsError } = await supabase
      .from('results')
      .delete()
      .eq('moto_id', params.motoId)
    
    if (resultsError) throw resultsError

    // 2. Delete associated moto_riders
    const { error: motoRidersError } = await supabase
      .from('moto_riders')
      .delete()
      .eq('moto_id', params.motoId)
      
    if (motoRidersError) throw motoRidersError

    // 3. Delete the moto itself
    const { error: deleteMotoError } = await supabase
      .from('motos')
      .delete()
      .eq('id', params.motoId)

    if (deleteMotoError) throw deleteMotoError

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('Error deleting moto:', err)
    return NextResponse.json(
      { error: err.message || 'Internal server error while deleting moto.' },
      { status: 500 }
    )
  }
}
